# SmartBank AI — upgraded academic demo

## Included
- Register/login with password hashing and Flask sessions
- Demo balance and simulated transfers with explainable risk rules
- Local demo OTP recovery (not SMS)
- Service applications and status tracking
- Monthly spending chart, login history and security alerts
- FAQ chatbot
- Admin summary and application approval

All balances and transfers are simulated. This is not production banking software.

## Windows PowerShell setup
Open PowerShell in the outer `SmartBank_AI_Upgrade` folder:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Start the app from this same folder:

```powershell
.\.venv\Scripts\python.exe app.py
```

Open http://127.0.0.1:5000 and keep the terminal open.

## Optional admin setup
1. Register normally using the website.
2. Stop the server with Ctrl+C.
3. Run this from the project folder, replacing the email:

```powershell
.\.venv\Scripts\python.exe make_admin.py your_registered_email@example.com
```

4. Restart `app.py` and log in again.

## Existing database
The app creates `smartbank.db` automatically. New tables are added using `CREATE TABLE IF NOT EXISTS`. Back up your existing database before testing an upgrade.

Never enter real bank passwords, PINs, OTPs, card details or personal financial information.


## Bank selection module
The dashboard includes a searchable selector with 20 commonly used Indian banks. The selected bank is stored in the current browser's local storage for this demo. This is a UI/demo preference only; it does not connect to any bank, validate account ownership, or perform financial transactions.
