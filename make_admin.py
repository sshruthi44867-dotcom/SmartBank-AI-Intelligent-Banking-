import sys
from database import get_db
if len(sys.argv)!=2:
    print("Usage: python make_admin.py your_registered_email@example.com")
    raise SystemExit(1)
db=get_db()
cur=db.execute("UPDATE users SET is_admin=1 WHERE email=?",(sys.argv[1].strip().lower(),))
db.commit()
print("Admin role enabled." if cur.rowcount else "Email not found. Register first.")
db.close()
