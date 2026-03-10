# A Telegram Miniapp for Calculating Costs for Groups of People

This repository contains a Telegram Miniapp that serves as a client for the Telegram Bot API. The Miniapp allows users to interact with Telegram directly from their mobile devices, providing a seamless experience.

## Summary

The application is static web hosted on GitHub Pages, built using TypeScript and Next.js. It provides a user-friendly interface for calculating the cost for a group of people. The cost segment can be varied. The application is designed to work well on telegram miniapp.

## Features
- **Balance summary** — table showing who owes whom and how much.
- **Add expense** — input total, select payer, select members, choose split type (equal or custom amounts).
- **Settlement flow** — tap a debtor to see payment options based on the creditor's saved bank/QR accounts.
- Login via Telegram; user is auto-registered on first launch.

---

## Architecture Overview

```
Telegram Client (Next.js Miniapp on GitHub Pages)
        │
        │  Telegram WebApp.initData (HMAC-signed)
        ▼
Google Apps Script (Web App — deployed as doPost/doGet)
        │
        │  SpreadsheetApp (server-side, private)
        ▼
Google Spreadsheet (Database — multiple sheets as tables)
```

- The **frontend** never accesses the spreadsheet directly.
- All persistence goes through the **Apps Script Web App**, which acts as a secure API gateway.
- Every API call from the miniapp must include raw `initData` from `window.Telegram.WebApp.initData`; the Apps Script verifies the HMAC before processing.

---

## 1. Telegram Bot Setup (BotFather)

1. Open Telegram and start a chat with `@BotFather`.
2. Run `/newbot` → choose a name and username (must end in `bot`). Save the **bot token**.
3. Run `/newapp` → select the bot → provide:
   - **Title** – displayed name of the miniapp.
   - **Description** – short tagline.
   - **Photo** – 640×360 PNG/JPEG cover image.
   - **GIF** (optional) demo animation.
   - **URL** – the GitHub Pages URL where the miniapp is hosted (e.g. `https://<org>.github.io/<repo>/`).
   - **Short name** – URL slug for `t.me/<botusername>/<shortname>`.
4. To attach the miniapp to a menu button, run `/setmenubutton` → select the bot → enter the same URL and button label.
5. Store the bot token as a repository secret (`BOT_TOKEN`) — **never commit it**.

---

## 2. Google Spreadsheet Database Schema

Create one Google Spreadsheet and add a separate sheet (tab) for each logical table. Use **row 1 as the header row** on every sheet.

### Sheets

#### `members` sheet
| Column | Type | Notes |
|---|---|---|
| `id` | string | Self-defined short ID (e.g. `shawn`, `alice`) — **not** auto-increment |
| `telegram_id` | string | Telegram user ID; blank for non-Telegram members |
| `name` | string | Display name |

#### `expenses` sheet
| Column | Type | Notes |
|---|---|---|
| `expense_id` | string | UUID or timestamp-based |
| `date` | string | ISO 8601 date (e.g. `2026-03-10`) |
| `amount` | number | Total bill amount |
| `payer` | string | `members.id` of who paid upfront |
| `members` | string | JSON array of member IDs involved, e.g. `["shawn","alice"]` |
| `splits` | string | JSON object of custom shares when `type=custom`, e.g. `{"shawn":120,"alice":80}` — empty string when equal |
| `type` | string | `equal` or `custom` |
| `paid` | boolean | `TRUE` once all debts from this expense are settled |
| `notes` | string | Optional description |

#### `banks` sheet
| Column | Type | Notes |
|---|---|---|
| `bank_id` | string | UUID or short ID |
| `member_id` | string | `members.id` |
| `alias` | string | Human label, e.g. `KBank`, `PromptPay` |
| `number` | string | Account or phone number |
| `qrcode` | string | URL or base64 data URI of the payment QR image |

**Rules:**
- All IDs are plain strings; Telegram `user_id` can exceed 32-bit integer range — always store as string.
- `members.id` is the join key across all sheets; keep it short and URL-safe (lowercase letters/digits).
- Store `members` and `splits` columns as JSON strings — parse/stringify in Apps Script.

---

## 3. Google Apps Script — Web App API

### 3.1 Project setup

1. Open the spreadsheet → **Extensions → Apps Script**.
2. In `appsscript.json` set:
   ```json
   {
     "timeZone": "Asia/Bangkok",
     "exceptionLogging": "STACKDRIVER",
     "runtimeVersion": "V8",
     "webapp": {
       "executeAs": "USER_DEPLOYING",
       "access": "ANYONE_ANONYMOUS"
     }
   }
   ```
3. Deploy → **New deployment** → type **Web app** → access **Anyone** (anonymous) → copy the deployment URL.
4. Store the deployment URL in the frontend as an env variable (`NEXT_PUBLIC_APPS_SCRIPT_URL`).

### 3.2 HMAC Telegram initData verification (Apps Script)

Every incoming request **must** provide the raw `initData` string from `window.Telegram.WebApp.initData`. The Apps Script verifies the HMAC-SHA256 signature using the bot token before any data operation.

```javascript
// utils/verifyTelegram.gs

const BOT_TOKEN = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');

/**
 * Verifies Telegram WebApp initData HMAC.
 * Returns the parsed user object on success, throws on failure.
 */
function verifyInitData(rawInitData) {
  const params = new URLSearchParams(rawInitData);

  const receivedHash = params.get('hash');
  if (!receivedHash) throw new Error('Missing hash in initData');

  // Build the check string: all fields except hash, sorted, joined by \n
  const checkArr = [];
  params.forEach((value, key) => {
    if (key !== 'hash') checkArr.push(`${key}=${value}`);
  });
  checkArr.sort();
  const checkString = checkArr.join('\n');

  // secret_key = HMAC-SHA256("WebAppData", botToken)
  const secretKey = Utilities.computeHmacSha256Signature(
    'WebAppData',
    BOT_TOKEN,
    Utilities.Charset.UTF_8
  );

  // expected_hash = HMAC-SHA256(checkString, secretKey)
  const expectedHashBytes = Utilities.computeHmacSha256Signature(
    checkString,
    secretKey
  );
  const expectedHash = expectedHashBytes
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2))
    .join('');

  if (expectedHash !== receivedHash) throw new Error('initData verification failed');

  // Optionally reject stale data (> 1 hour)
  const authDate = parseInt(params.get('auth_date'), 10);
  if (Date.now() / 1000 - authDate > 3600) throw new Error('initData expired');

  return JSON.parse(params.get('user'));
}
```

> **Note:** `Utilities.computeHmacSha256Signature` in Apps Script takes `(value, key)` — the string `"WebAppData"` is the **value** and the bot token is the **key** for the first call. For the second call the raw byte array from the first call is the key.

### 3.3 Router — doPost / doGet

```javascript
// Code.gs

function doPost(e) {
  return handleRequest_(e);
}

function doGet(e) {
  return handleRequest_(e);
}

function handleRequest_(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    // Supports two calling conventions:
    // 1. GET ?payload=<JSON string>  — used by the frontend to survive Apps Script's 302 redirect
    // 2. POST with JSON body          — usable from server-side callers / curl
    let body = {};
    if (e.parameter && e.parameter.payload) {
      body = JSON.parse(e.parameter.payload);
    } else if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    const params   = e.parameter || {};
    const action   = body.action   || params.action;
    const initData = body.initData || params.initData;

    const user = verifyInitData(initData); // throws if invalid

    let result;
    switch (action) {
      // Auth
      case 'registerUser':    result = registerUser(user);              break;
      // Members
      case 'getMembers':      result = getMembers();                    break;
      case 'upsertMember':    result = upsertMember(user, body);        break;
      // Expenses
      case 'getExpenses':     result = getExpenses();                   break;
      case 'addExpense':      result = addExpense(user, body);          break;
      case 'markPaid':        result = markPaid(user, body.expenseId);  break;
      // Balances (computed)
      case 'getBalances':     result = getBalances();                   break;
      // Banks
      case 'getBanks':        result = getBanks(body.memberId);         break;
      case 'upsertBank':      result = upsertBank(user, body);          break;
      default: throw new Error(`Unknown action: ${action}`);
    }

    output.setContent(JSON.stringify({ ok: true, data: result }));
  } catch (err) {
    output.setContent(JSON.stringify({ ok: false, error: err.message }));
  }

  return output;
}
```

### 3.4 User registration / login

On first launch the miniapp calls `registerUser`. This upserts the Telegram user into the `members` sheet, using the Telegram numeric ID as `telegram_id` and a slugified first name as the default `id` if none exists yet.

```javascript
// handlers/members.gs

function registerUser(telegramUser) {
  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('members');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0]; // ['id', 'telegram_id', 'name']

  const tgCol = headers.indexOf('telegram_id');
  const existing = data.slice(1).find(row => String(row[tgCol]) === String(telegramUser.id));

  if (!existing) {
    // Default member id = lowercase first_name; caller may update later
    const defaultId = (telegramUser.first_name || 'user').toLowerCase().replace(/\s+/g, '_');
    sheet.appendRow([
      defaultId,
      String(telegramUser.id),
      telegramUser.first_name + (telegramUser.last_name ? ' ' + telegramUser.last_name : ''),
    ]);
    return { registered: true };
  }
  return { registered: false };
}

function getMembers() {
  return sheetToObjects_('members');
}

function upsertMember(telegramUser, body) {
  // Only allow a user to edit their own member record
  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('members');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const tgCol   = headers.indexOf('telegram_id');
  const rowIdx  = data.slice(1).findIndex(r => String(r[tgCol]) === String(telegramUser.id));
  if (rowIdx === -1) throw new Error('Member not found');
  const sheetRow = rowIdx + 2; // 1-indexed + header
  if (body.name)  sheet.getRange(sheetRow, headers.indexOf('name') + 1).setValue(body.name);
  if (body.id)    sheet.getRange(sheetRow, headers.indexOf('id')   + 1).setValue(body.id);
  return { ok: true };
}
```

### 3.5 Expense handlers

```javascript
// handlers/expenses.gs

function getExpenses() {
  return sheetToObjects_('expenses');
}

function addExpense(telegramUser, body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('expenses');
  const id    = Utilities.getUuid();
  sheet.appendRow([
    id,
    body.date,
    Number(body.amount),
    body.payer,
    JSON.stringify(body.members),          // e.g. ["shawn","alice"]
    body.type === 'custom' ? JSON.stringify(body.splits) : '',
    body.type,   // 'equal' | 'custom'
    false,       // paid
    body.notes || '',
  ]);
  return { expense_id: id };
}

function markPaid(telegramUser, expenseId) {
  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('expenses');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol   = headers.indexOf('expense_id');
  const paidCol = headers.indexOf('paid');
  const rowIdx  = data.slice(1).findIndex(r => r[idCol] === expenseId);
  if (rowIdx === -1) throw new Error('Expense not found');
  sheet.getRange(rowIdx + 2, paidCol + 1).setValue(true);
  return { ok: true };
}
```

### 3.6 Balance computation

Balances are computed server-side from the `expenses` sheet. The result is a list of `{ from, to, amount }` records representing the minimum set of transfers required to settle all unpaid expenses.

```javascript
// handlers/balances.gs

function getBalances() {
  const expenses = sheetToObjects_('expenses').filter(e => !e.paid || e.paid === 'FALSE');
  const net = {}; // net[memberId] = amount owed (positive = owed money, negative = owes money)

  expenses.forEach(exp => {
    const amount  = Number(exp.amount);
    const payer   = exp.payer;
    const members = JSON.parse(exp.members);

    let shares;
    if (exp.type === 'custom' && exp.splits) {
      shares = JSON.parse(exp.splits);
    } else {
      const each = amount / members.length;
      shares = Object.fromEntries(members.map(m => [m, each]));
    }

    // Payer is owed their full outlay, each member owes their share
    net[payer] = (net[payer] || 0) + amount;
    members.forEach(m => { net[m] = (net[m] || 0) - shares[m]; });
  });

  // Greedy minimum-transactions settle algorithm
  const creditors = [], debtors = [];
  Object.entries(net).forEach(([id, bal]) => {
    if (bal > 0.005)  creditors.push({ id, bal });
    if (bal < -0.005) debtors.push({ id, bal: -bal });
  });
  creditors.sort((a, b) => b.bal - a.bal);
  debtors.sort((a, b) => b.bal - a.bal);

  const transfers = [];
  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci], d = debtors[di];
    const amt = Math.min(c.bal, d.bal);
    transfers.push({ from: d.id, to: c.id, amount: Math.round(amt * 100) / 100 });
    c.bal -= amt;
    d.bal -= amt;
    if (c.bal < 0.005) ci++;
    if (d.bal < 0.005) di++;
  }
  return transfers;
}
```

### 3.7 Bank handlers

```javascript
// handlers/banks.gs

function getBanks(memberId) {
  return sheetToObjects_('banks').filter(b => b.member_id === memberId);
}

function upsertBank(telegramUser, body) {
  // Verify caller owns that member record
  const members = sheetToObjects_('members');
  const member  = members.find(m => String(m.telegram_id) === String(telegramUser.id));
  if (!member || member.id !== body.member_id) throw new Error('Unauthorized');

  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('banks');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol   = headers.indexOf('bank_id');
  const rowIdx  = data.slice(1).findIndex(r => r[idCol] === body.bank_id);

  if (rowIdx === -1) {
    // Insert
    const id = body.bank_id || Utilities.getUuid();
    sheet.appendRow([id, body.member_id, body.alias || '', body.number || '', body.qrcode || '']);
    return { bank_id: id };
  } else {
    // Update
    const row = rowIdx + 2;
    ['alias','number','qrcode'].forEach(col => {
      if (body[col] !== undefined)
        sheet.getRange(row, headers.indexOf(col) + 1).setValue(body[col]);
    });
    return { ok: true };
  }
}
```

### 3.8 Shared utility

```javascript
// utils/sheetHelpers.gs

function sheetToObjects_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const [headers, ...rows] = sheet.getDataRange().getValues();
  return rows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
}
```

---

## 4. Frontend — Next.js Miniapp

### 4.0 UI Screens & Flow

The app has three main views:

#### Screen 1 — Balance Summary (`/`)
- Calls `getBalances` on mount and renders a table: **[Person] owes [Person] ฿[amount]**.
- Each row for a debtor is tappable. Tapping opens the **Settlement Sheet** (Screen 3).
- A floating button opens the **Add Expense** form (Screen 2).

#### Screen 2 — Add Expense (bottom sheet or `/add`)
| Field | Control |
|---|---|
| Date | Date picker (default today) |
| Total amount | Number input |
| Payer | Member picker (single-select) |
| Members | Member picker (multi-select, checkboxes) |
| Split type | Toggle: **Equal** / **Custom** |
| Custom amounts | Per-member number inputs (visible when type = custom); must sum to total |
| Notes | Optional text input |

- On submit → `addExpense` → refresh balances.
- Validate that custom splits sum to the total before sending.

#### Screen 3 — Settlement / Pay Sheet (bottom sheet)
- Triggered by tapping a debt row. Shows the **creditor's** saved bank accounts (`getBanks(creditorId)`).
- Each bank entry shows: alias, account number, and a QR code image (rendered from `qrcode` field).
- A **"Mark as Paid"** button (or swipe gesture) calls `markPaid` for all resolved expenses between the pair, then refreshes balances.

---

### 4.1 Read Telegram context on mount

```typescript
// hooks/useTelegramUser.ts
import { useEffect, useState } from 'react';

export interface TelegramUser {
  id: number;
  username?: string;
  first_name: string;
  last_name?: string;
}

export function useTelegramUser() {
  const [user, setUser]       = useState<TelegramUser | null>(null);
  const [initData, setInitData] = useState<string>('');

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    tg.ready();
    tg.expand();
    setUser(tg.initDataUnsafe?.user ?? null);
    setInitData(tg.initData);
  }, []);

  return { user, initData };
}
```

### 4.2 API client — always send initData

```typescript
// lib/api.ts
const BASE_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL!;

export async function appsScriptCall<T>(
  action: string,
  body: Record<string, unknown> = {},
  initData: string
): Promise<T> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, initData, ...body }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json.data as T;
}
```

### 4.3 Register user on first load

```typescript
// app/page.tsx  (or _app.tsx)
import { useEffect } from 'react';
import { useTelegramUser } from '@/hooks/useTelegramUser';
import { appsScriptCall } from '@/lib/api';

export default function Home() {
  const { user, initData } = useTelegramUser();

  useEffect(() => {
    if (!initData) return;
    appsScriptCall('registerUser', {}, initData).catch(console.error);
  }, [initData]);

  // ...render UI
}
```

---

## 5. Security Checklist

| Concern | Mitigation |
|---|---|
| Fake initData | HMAC-SHA256 verification in Apps Script on every request |
| Stale sessions | Reject `auth_date` older than 1 hour |
| Bot token exposure | Stored only in Apps Script Script Properties, never in frontend |
| Spreadsheet access | Spreadsheet is private; Apps Script runs as the owner |
| CORS | Apps Script returns JSON only; frontend uses `fetch` with no credentials |
| XSS | Use React's default escaping; never inject raw HTML from API responses |

---

## 6. Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_APPS_SCRIPT_URL` | Frontend `.env.local` / GitHub Actions secret | Deployed Apps Script Web App URL |
| `BOT_TOKEN` | Apps Script Script Properties | Telegram bot token for HMAC verification |

Set `BOT_TOKEN` in Apps Script via **Project Settings → Script Properties → Add property**.

---

## 7. Deployment

1. **Frontend** – push to `main`; GitHub Actions builds Next.js with `output: 'export'` and deploys to `gh-pages` branch.
2. **Apps Script** – after any change, create a new versioned deployment. Update `NEXT_PUBLIC_APPS_SCRIPT_URL` if the URL changes.
3. **BotFather** – if the GitHub Pages URL changes, update the miniapp URL via `/editapp`.
