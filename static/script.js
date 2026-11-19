
// =====================================================
// SMARTBANK AI - COMPLETE FRONTEND SCRIPT
// Existing features + 15 new feature integrations
// Dark Purple Dashboard | 20 Bank Selection
// Academic Demo Only
// =====================================================

const $ = id => document.getElementById(id);
let authMode = "register";

function setMsg(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
}

function setHTML(id, html) {
    const el = $(id);
    if (el) el.innerHTML = html;
}

function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
}

function bind(id, event, callback) {
    const el = $(id);
    if (el) el.addEventListener(event, callback);
}

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[c]);
}

async function api(url, method = "GET", body = null) {
    const options = {
        method,
        headers: {}
    };

    if (body !== null) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error("Invalid server response. Please try again.");
    }

    if (!response.ok || data.ok === false) {
        throw new Error(data.message || data.error || "Request failed");
    }

    return data;
}

function showError(id, error) {
    setMsg(id, error.message || "Something went wrong.");
}

function money(value) {
    return "₹" + Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// =====================================================
// AUTHENTICATION
// =====================================================

function showAuth(mode) {
    authMode = mode;

    $("auth")?.classList.remove("hidden");

    setText(
        "authTitle",
        mode === "register" ? "Create account" : "Login"
    );

    $("nameWrap")?.classList.toggle("hidden", mode === "login");

    if ($("password")) {
        $("password").autocomplete =
            mode === "login" ? "current-password" : "new-password";
    }

    setMsg("authMsg", "");
}

bind("showRegister", "click", () => showAuth("register"));
bind("showLogin", "click", () => showAuth("login"));

bind("closeAuth", "click", () => {
    $("auth")?.classList.add("hidden");
});

bind("authForm", "submit", async event => {
    event.preventDefault();

    try {
        const data = await api(
            "/api/" + (authMode === "register" ? "register" : "login"),
            "POST",
            {
                name: $("name")?.value || "",
                email: $("email")?.value || "",
                password: $("password")?.value || ""
            }
        );

        setMsg("authMsg", data.message || "Successful");
        await loadWorkspace();

    } catch (error) {
        showError("authMsg", error);
    }
});

bind("logout", "click", async () => {
    try {
        await api("/api/logout", "POST");
        location.reload();
    } catch (error) {
        alert(error.message);
    }
});

// =====================================================
// WORKSPACE AND DASHBOARD
// =====================================================

async function loadWorkspace() {
    try {
        const me = await api("/api/me");

        if (!me.logged_in) return;

        $("landing")?.classList.add("hidden");
        $("auth")?.classList.add("hidden");
        $("workspace")?.classList.remove("hidden");
        $("logout")?.classList.remove("hidden");

        setText("userName", me.name || "User");

        await refreshAll();

    } catch (error) {
        console.error("Workspace:", error);
    }
}

async function refreshAll() {
    try {
        const data = await api("/api/dashboard");

        setText("balance", money(data.user.balance));
        setText("accountStatus", data.user.account_status);

        setHTML(
            "transactions",
            (data.transactions || []).map(t => `
                <tr>
                    <td>${esc(t.kind)}</td>
                    <td>${esc(t.description)}</td>
                    <td>${money(t.amount)}</td>
                    <td>${esc(t.created_at)}</td>
                </tr>
            `).join("") ||
            '<tr><td colspan="4">No transactions yet.</td></tr>'
        );

        const applications = await api("/api/applications");

        setHTML(
            "apps",
            (applications.applications || []).map(item => `
                <p>
                    ${esc(item.reference)} ·
                    ${esc(item.kind)} ·
                    <b>${esc(item.status)}</b>
                </p>
            `).join("") || "<p>No applications yet.</p>"
        );

        const notifications = await api("/api/notifications");

        setHTML(
            "notifications",
            (notifications.notifications || []).map(item => `
                <p>
                    ${esc(item.message)}
                    <small>${esc(item.created_at)}</small>
                </p>
            `).join("") || "<p>No notifications.</p>"
        );

        await loadChart();

    } catch (error) {
        console.error("Dashboard:", error);
    }
}

bind("refresh", "click", refreshAll);

// =====================================================
// TRANSACTION CHART
// =====================================================

async function loadChart() {
    try {
        const data = await api("/api/analytics");
        const months = data.months || [];

        const max = Math.max(
            1,
            ...months.map(item => Number(item.spent || 0))
        );

        setHTML(
            "chart",
            months.map(item => `
                <div class="baritem">
                    <div class="bar"
                        style="height:${Math.max(
                            4,
                            Number(item.spent || 0) / max * 110
                        )}px">
                    </div>
                    ₹${Math.round(Number(item.spent || 0))}
                    <br>${esc(item.month)}
                </div>
            `).join("") || "No monthly spending yet."
        );

    } catch (error) {
        console.error("Chart:", error);
    }
}

// =====================================================
// DEMO MONEY TRANSFER
// =====================================================

bind("transferForm", "submit", async event => {
    event.preventDefault();

    try {
        const data = await api("/api/demo-transfer", "POST", {
            recipient: $("recipient")?.value || "",
            amount: $("amount")?.value || ""
        });

        setMsg(
            "transferMsg",
            (data.message || "Demo transfer completed.") +
            " Risk: " + (data.risk?.level || "Checked")
        );

        await refreshAll();

    } catch (error) {
        showError("transferMsg", error);
    }
});

// =====================================================
// ACCOUNT RECOVERY - DEMO OTP
// =====================================================

bind("otpBtn", "click", async () => {
    try {
        const data = await api("/api/recovery/request-otp", "POST");

        setText(
            "otpDisplay",
            data.demo_otp ? "Demo OTP: " + data.demo_otp : ""
        );

        setMsg("recoveryMsg", data.message || "OTP requested.");

    } catch (error) {
        showError("recoveryMsg", error);
    }
});

bind("verifyOtp", "click", async () => {
    try {
        const data = await api("/api/recovery/verify-otp", "POST", {
            otp: $("otpInput")?.value || ""
        });

        setMsg("recoveryMsg", data.message || "OTP verified.");
        await refreshAll();

    } catch (error) {
        showError("recoveryMsg", error);
    }
});

// =====================================================
// APPLICATIONS
// =====================================================

bind("applyBtn", "click", async () => {
    try {
        const data = await api("/api/applications", "POST", {
            type: $("appType")?.value || ""
        });

        setMsg(
            "appMsg",
            (data.message || "Application submitted.") +
            " Reference: " + (data.reference || "")
        );

        await refreshAll();

    } catch (error) {
        showError("appMsg", error);
    }
});

// =====================================================
// SECURITY CENTER
// =====================================================

bind("securityBtn", "click", async () => {
    try {
        const data = await api("/api/security");

        setHTML(
            "securityData",
            "<b>Login history</b>" +
            (data.login_history || []).map(item => `
                <p>
                    ${esc(item.status)} ·
                    ${esc(item.ip_address)} ·
                    ${esc(item.created_at)}
                </p>
            `).join("") +
            "<b>Security alerts</b>" +
            (data.alerts || []).map(item => `
                <p>
                    ${esc(item.severity)} ·
                    ${esc(item.message)}
                </p>
            `).join("")
        );

    } catch (error) {
        showError("securityData", error);
    }
});

// =====================================================
// SMARTBANK AI CHATBOT
// =====================================================

async function askChat() {
    const question = $("chatQuestion")?.value.trim();

    if (!question) return;

    try {
        const data = await api(
            "/api/chat?q=" + encodeURIComponent(question)
        );

        const log = $("chatLog");

        if (log) {
            log.innerHTML += `
                <p><b>You:</b> ${esc(question)}</p>
                <p><b>SmartBank:</b> ${esc(data.answer)}</p>
            `;

            log.scrollTop = log.scrollHeight;
        }

        setText("chatQuestion", "");

    } catch (error) {
        setText("chatLog", error.message);
    }
}

bind("chatSend", "click", askChat);

bind("chatQuestion", "keydown", event => {
    if (event.key === "Enter") {
        event.preventDefault();
        askChat();
    }
});

// =====================================================
// ADMIN PANEL
// =====================================================

bind("adminLoad", "click", async () => {
    try {
        const data = await api("/api/admin/summary");

        setText(
            "adminStats",
            `Users: ${data.users} | Transactions: ${data.transactions} |
            Applications: ${data.applications} | Pending: ${data.pending}`
        );

        const applications = await api("/api/admin/applications");

        setHTML(
            "adminApps",
            (applications.applications || []).map(item => `
                <p>
                    ${esc(item.reference)} ·
                    ${esc(item.name)} ·
                    ${esc(item.kind)} ·
                    ${esc(item.status)}
                    <button onclick="updateApp(${Number(item.id)},'APPROVED')">
                        Approve
                    </button>
                    <button onclick="updateApp(${Number(item.id)},'REJECTED')">
                        Reject
                    </button>
                </p>
            `).join("")
        );

    } catch (error) {
        showError("adminStats", error);
    }
});

async function updateApp(id, status) {
    try {
        await api("/api/admin/applications/" + id, "POST", {
            status
        });

        if ($("adminLoad")) $("adminLoad").click();

    } catch (error) {
        showError("adminStats", error);
    }
}

async function checkAdmin() {
    try {
        await api("/api/admin/summary");
        $("adminPanel")?.classList.remove("hidden");
    } catch {
        $("adminPanel")?.classList.add("hidden");
    }
}

// =====================================================
// BANK SELECTION - 20 BANKS
// =====================================================

const DEMO_BANKS = [
    "State Bank of India (SBI)",
    "HDFC Bank",
    "ICICI Bank",
    "Punjab National Bank (PNB)",
    "Bank of Baroda",
    "Canara Bank",
    "Union Bank of India",
    "Bank of India",
    "Indian Bank",
    "Central Bank of India",
    "Indian Overseas Bank",
    "UCO Bank",
    "Bank of Maharashtra",
    "Punjab & Sind Bank",
    "Axis Bank",
    "Kotak Mahindra Bank",
    "IndusInd Bank",
    "Yes Bank",
    "IDBI Bank",
    "Federal Bank"
];

const BANK_STORAGE_KEY = "smartbank_demo_selected_bank";

function renderBankOptions(filter = "") {
    const select = $("bankSelect");
    if (!select) return;

    const previous =
        select.value ||
        localStorage.getItem(BANK_STORAGE_KEY) ||
        "";

    const query = filter.trim().toLowerCase();

    const matches = DEMO_BANKS.filter(name =>
        name.toLowerCase().includes(query)
    );

    select.innerHTML =
        '<option value="">Choose your bank</option>' +
        matches.map(name =>
            `<option value="${esc(name)}">${esc(name)}</option>`
        ).join("");

    if (matches.includes(previous)) {
        select.value = previous;
    }
}

function loadSavedBank() {
    const saved = localStorage.getItem(BANK_STORAGE_KEY) || "";

    if ($("bankSelect")) {
        renderBankOptions($("bankSearch")?.value || "");

        if (saved && DEMO_BANKS.includes(saved)) {
            $("bankSelect").value = saved;
        }
    }

    setText("selectedBank", saved || "No bank selected");
}

bind("bankSearch", "input", event => {
    renderBankOptions(event.target.value);
});

bind("bankSelect", "change", event => {
    setText(
        "selectedBank",
        event.target.value || "No bank selected"
    );

    setMsg(
        "bankMsg",
        "Review your choice and click Save Bank Selection."
    );
});

bind("saveBank", "click", () => {
    const bank = $("bankSelect")?.value;

    if (!bank) {
        setMsg("bankMsg", "Please choose a bank first.");
        return;
    }

    localStorage.setItem(BANK_STORAGE_KEY, bank);
    setText("selectedBank", bank);
    setMsg("bankMsg", "Bank selection saved on this browser.");
});

renderBankOptions();
loadSavedBank();

// =====================================================
// FACE CAMERA - DEMO ONLY
// =====================================================

let faceCameraStream = null;

bind("faceStart", "click", async () => {
    try {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error(
                "Camera unavailable. Use localhost or HTTPS."
            );
        }

        if (faceCameraStream) {
            faceCameraStream.getTracks().forEach(track => track.stop());
        }

        faceCameraStream =
            await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user" },
                audio: false
            });

        if ($("faceVideo")) {
            $("faceVideo").srcObject = faceCameraStream;
            await $("faceVideo").play();
        }

        setMsg("faceMsg", "Camera started successfully.");

    } catch (error) {
        setMsg("faceMsg", "Camera error: " + error.message);
    }
});

bind("faceLogin", "click", async () => {
    const video = $("faceVideo");

    if (!faceCameraStream || !video?.videoWidth) {
        setMsg("faceMsg", "Please click Start Camera first.");
        return;
    }

    try {
        const data = await api("/api/face-demo", "POST");

        setMsg(
            "faceMsg",
            data.message || "Demo verification completed. This is not real face recognition."
        );

    } catch (error) {
        showError("faceMsg", error);
    }
});

window.addEventListener("beforeunload", () => {
    if (faceCameraStream) {
        faceCameraStream.getTracks().forEach(track => track.stop());
    }
});

// =====================================================
// 1. QR CODE GENERATOR
// =====================================================

bind("qrGenerate", "click", async () => {
    try {
        const amount = $("qrAmount")?.value;

        const data = await api("/api/qr/generate", "POST", {
            amount
        });

        const result = $("qrResult");

        if (result) {
            result.innerHTML = "";

            if (data.qr_code || data.qr || data.image) {
                const image = document.createElement("img");

                image.src =
                    data.qr_code ||
                    data.qr ||
                    data.image;

                image.alt = "Demo QR Code";

                result.appendChild(image);
            } else {
                result.textContent =
                    data.message || "QR generated.";
            }
        }

        setMsg("qrMsg", data.message || "QR generated.");

    } catch (error) {
        showError("qrMsg", error);
    }
});

// =====================================================
// 2. INVESTMENTS
// =====================================================

async function loadInvestments() {
    try {
        const data = await api("/api/investments");

        setHTML(
            "investmentList",
            (data.investments || []).map(item => `
                <p>
                    ${esc(item.investment_type || item.type)}
                    · ${money(item.amount)}
                </p>
            `).join("") || "<p>No investments yet.</p>"
        );

    } catch (error) {
        showError("investmentMsg", error);
    }
}

bind("investmentAdd", "click", async () => {
    try {
        const data = await api("/api/investments", "POST", {
            amount: $("investmentAmount")?.value,
            investment_type: $("investmentType")?.value
        });

        setMsg("investmentMsg", data.message || "Investment added.");
        await loadInvestments();

    } catch (error) {
        showError("investmentMsg", error);
    }
});

// =====================================================
// 3. CREDIT SCORE
// =====================================================

bind("creditCalculate", "click", async () => {
    try {
        const data = await api("/api/credit-score", "POST", {});

        setText(
            "creditScore",
            data.score ?? data.credit_score ?? "Calculated"
        );

        setMsg("creditMsg", data.message || "Demo credit score calculated.");

    } catch (error) {
        showError("creditMsg", error);
    }
});

// =====================================================
// 4. RECURRING PAYMENTS
// =====================================================

async function loadRecurring() {
    try {
        const data = await api("/api/recurring");

        setHTML(
            "recurringList",
            (data.payments || []).map(item => `
                <p>
                    ${esc(item.payment_name)}
                    · ${money(item.amount)}
                    · ${esc(item.frequency)}
                    · ${esc(item.status)}
                </p>
            `).join("") || "<p>No recurring payments.</p>"
        );

    } catch (error) {
        showError("recurringMsg", error);
    }
}

bind("recurringAdd", "click", async () => {
    try {
        const data = await api("/api/recurring", "POST", {
            payment_name: $("recurringName")?.value,
            amount: $("recurringAmount")?.value,
            frequency: $("recurringFrequency")?.value
        });

        setMsg("recurringMsg", data.message || "Payment added.");
        await loadRecurring();

    } catch (error) {
        showError("recurringMsg", error);
    }
});

// =====================================================
// 5. SMART BUDGET PLANNER
// =====================================================

bind("budgetCalculate", "click", async () => {
    try {
        const data = await api("/api/budget", "POST", {
            income: $("budgetIncome")?.value,
            expenses: $("budgetExpense")?.value
        });

        setHTML(
            "budgetResult",
            `
            <p>Income: ${money(data.income)}</p>
            <p>Expenses: ${money(data.expenses ?? data.expense)}</p>
            <p>Remaining: ${money(data.remaining ?? data.balance)}</p>
            <p>${esc(data.message || "Budget calculated.")}</p>
            `
        );

    } catch (error) {
        showError("budgetResult", error);
    }
});

// =====================================================
// 6. FRAUD ALERTS
// =====================================================

bind("fraudLoad", "click", async () => {
    try {
        const data = await api("/api/fraud-alerts");

        setHTML(
            "fraudResults",
            (data.alerts || []).map(item => `
                <p>
                    <b>${esc(item.severity)}</b>
                    · ${esc(item.message)}
                    · ${esc(item.created_at)}
                </p>
            `).join("") || "<p>No fraud alerts found.</p>"
        );

    } catch (error) {
        showError("fraudResults", error);
    }
});

// =====================================================
// 7. CUSTOMER SUPPORT
// =====================================================

async function loadSupport() {
    try {
        const data = await api("/api/support");

        setHTML(
            "supportList",
            (data.tickets || []).map(item => `
                <p>
                    <b>${esc(item.subject)}</b>
                    · ${esc(item.status)}
                    <br>${esc(item.message)}
                </p>
            `).join("") || "<p>No support tickets.</p>"
        );

    } catch (error) {
        showError("supportMsg", error);
    }
}

bind("supportSubmit", "click", async () => {
    try {
        const data = await api("/api/support", "POST", {
            subject: $("supportSubject")?.value,
            message: $("supportMessage")?.value
        });

        setMsg("supportMsg", data.message || "Support ticket submitted.");
        await loadSupport();

    } catch (error) {
        showError("supportMsg", error);
    }
});

// =====================================================
// 8. VIRTUAL CARD - DEMO
// =====================================================

bind("virtualCardGenerate", "click", async () => {
    try {
        const data = await api("/api/virtual-card", "POST", {});

        setHTML(
            "virtualCardResult",
            `
            <h3>SMARTBANK AI</h3>
            <p>Card Number: ${esc(data.card_number || "Demo card generated")}</p>
            <p>Card Holder: ${esc(data.card_holder || "Demo User")}</p>
            <p>Expiry: ${esc(data.expiry || "Demo")}</p>
            <p>CVV: Hidden for security</p>
            <small>Academic demo card - not valid for real purchases.</small>
            `
        );

        setMsg("virtualCardMsg", data.message || "Demo card generated.");

    } catch (error) {
        showError("virtualCardMsg", error);
    }
});

// =====================================================
// 9. SCHEDULED TRANSFERS
// =====================================================

async function loadScheduledTransfers() {
    try {
        const data = await api("/api/scheduled-transfers");

        setHTML(
            "scheduleList",
            (data.transfers || []).map(item => `
                <p>
                    ${esc(item.recipient)}
                    · ${money(item.amount)}
                    · ${esc(item.scheduled_date || item.transfer_date)}
                    · ${esc(item.status)}
                </p>
            `).join("") || "<p>No scheduled transfers.</p>"
        );

    } catch (error) {
        showError("scheduleMsg", error);
    }
}

bind("scheduleSubmit", "click", async () => {
    try {
        const data = await api("/api/scheduled-transfers", "POST", {
            recipient: $("scheduleRecipient")?.value,
            amount: $("scheduleAmount")?.value,
            scheduled_date: $("scheduleDate")?.value
        });

        setMsg("scheduleMsg", data.message || "Transfer scheduled.");
        await loadScheduledTransfers();

    } catch (error) {
        showError("scheduleMsg", error);
    }
});

// =====================================================
// 10. FINANCIAL HEALTH
// =====================================================

bind("healthCalculate", "click", async () => {
    try {
        const data = await api("/api/financial-health");

        setText(
            "healthScore",
            data.score ?? data.health_score ?? "Calculated"
        );

        setHTML(
            "healthResult",
            `
            <p>${esc(data.message || "Financial health analysis completed.")}</p>
            <p>${esc(data.recommendation || "")}</p>
            `
        );

    } catch (error) {
        showError("healthResult", error);
    }
});

// =====================================================
// 11. MULTIPLE FINANCIAL ACCOUNTS
// =====================================================

async function loadAccounts() {
    try {
        const data = await api("/api/accounts");

        setHTML(
            "accountList",
            (data.accounts || []).map(item => `
                <p>
                    ${esc(item.account_name)}
                    · ${esc(item.account_type)}
                    · ${money(item.balance)}
                </p>
            `).join("") || "<p>No additional accounts.</p>"
        );

    } catch (error) {
        showError("accountMsg", error);
    }
}

bind("accountAdd", "click", async () => {
    try {
        const data = await api("/api/accounts", "POST", {
            account_name: $("accountName")?.value,
            account_type: $("accountType")?.value
        });

        setMsg("accountMsg", data.message || "Account added.");
        await loadAccounts();

    } catch (error) {
        showError("accountMsg", error);
    }
});

// =====================================================
// 12. CURRENCY CONVERTER
// =====================================================

bind("currencyConvert", "click", async () => {
    try {
        const data = await api("/api/currency", "POST", {
            amount: $("currencyAmount")?.value,
            currency: $("currencyType")?.value
        });

        setHTML(
            "currencyResult",
            `
            <h3>${esc(data.converted_amount ?? data.result ?? "Conversion complete")}</h3>
            <p>${esc(data.message || "Demo currency conversion.")}</p>
            `
        );

        setMsg("currencyMsg", data.message || "Conversion completed.");

    } catch (error) {
        showError("currencyMsg", error);
    }
});

// =====================================================
// 13. DOCUMENT VAULT - FILE UPLOAD
// =====================================================

async function loadDocuments() {
    try {
        const data = await api("/api/documents");

        setHTML(
            "documentList",
            (data.documents || []).map(item => `
                <p>
                    ${esc(item.filename || item.original_name)}
                    <a href="/api/documents/${Number(item.id)}/download"
                       target="_blank" rel="noopener">
                       Download
                    </a>
                </p>
            `).join("") || "<p>No documents uploaded.</p>"
        );

    } catch (error) {
        showError("documentMsg", error);
    }
}

bind("documentUpload", "click", async () => {
    const file = $("documentFile")?.files?.[0];

    if (!file) {
        setMsg("documentMsg", "Please select a document first.");
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await fetch("/api/documents", {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (!response.ok || data.ok === false) {
            throw new Error(data.message || "Upload failed.");
        }

        setMsg("documentMsg", data.message || "Document uploaded.");
        await loadDocuments();

    } catch (error) {
        showError("documentMsg", error);
    }
});

// =====================================================
// 14. ADVANCED ADMIN ANALYTICS
// =====================================================

bind("advancedAnalytics", "click", async () => {
    try {
        const data = await api("/api/admin/analytics");

        setHTML(
            "advancedAnalyticsResult",
            `
            <h3>Advanced Analytics</h3>
            <p>Users: ${esc(data.users ?? "N/A")}</p>
            <p>Transactions: ${esc(data.transactions ?? "N/A")}</p>
            <p>Applications: ${esc(data.applications ?? "N/A")}</p>
            <p>Total amount: ${money(data.total_amount ?? 0)}</p>
            `
        );

    } catch (error) {
        showError("advancedAnalyticsResult", error);
    }
});

// =====================================================
// LOAD ALL NEW FEATURE DATA
// =====================================================

async function loadNewFeatures() {
    const tasks = [
        loadInvestments,
        loadRecurring,
        loadSupport,
        loadScheduledTransfers,
        loadAccounts,
        loadDocuments
    ];

    for (const task of tasks) {
        try {
            await task();
        } catch (error) {
            console.error(error);
        }
    }
}

// =====================================================
// INITIALIZATION
// =====================================================

async function initializeSmartBank() {
    await loadWorkspace();
    await checkAdmin();

    if (!$("workspace")?.classList.contains("hidden")) {
        await loadNewFeatures();
    }
}

initializeSmartBank();
// =====================================================
// SMARTBANK AI - CUSTOM LANGUAGE SYSTEM
// 25 LANGUAGES | FRONTEND TRANSLATION
// Existing banking functions are not changed
// =====================================================

const SMARTBANK_LANGUAGES = {
    en: {
        "Features": "Features",
        "Logout": "Logout",
        "Create account": "Create account",
        "Login": "Login",
        "Close": "Close",
        "Continue": "Continue",
        "Name": "Name",
        "Email": "Email",
        "Password": "Password",
        "Welcome, ": "Welcome, ",
        "Demo environment": "Demo environment",
        "Demo balance": "Demo balance",
        "Account status": "Account status",
        "Protection": "Protection",
        "Select Your Bank": "Select Your Bank",
        "Search bank": "Search bank",
        "Available banks": "Available banks",
        "Save Bank Selection": "Save Bank Selection",
        "Simulated transfer": "Simulated transfer",
        "Recipient": "Recipient",
        "Amount (₹)": "Amount (₹)",
        "Run demo transfer": "Run demo transfer",
        "Account recovery": "Account recovery",
        "Generate demo OTP": "Generate demo OTP",
        "Verify and unlock": "Verify and unlock",
        "Apply for service": "Apply for service",
        "Submit application": "Submit application",
        "Notifications": "Notifications",
        "Security centre": "Security centre",
        "Banking FAQ chatbot": "Banking FAQ chatbot",
        "Ask": "Ask",
        "Recent transactions": "Recent transactions",
        "Refresh": "Refresh",
        "Monthly spending (demo)": "Monthly spending (demo)",
        "Face Recognition Login": "Face Recognition Login",
        "Start Camera": "Start Camera",
        "Verify Face": "Verify Face",
        "QR Payment": "QR Payment",
        "Generate QR": "Generate QR",
        "Investment Portfolio": "Investment Portfolio",
        "Add Demo Investment": "Add Demo Investment",
        "Credit Score Simulator": "Credit Score Simulator",
        "Calculate Score": "Calculate Score",
        "Recurring Payments": "Recurring Payments",
        "Add Recurring Payment": "Add Recurring Payment",
        "Smart Budget Planner": "Smart Budget Planner",
        "Calculate Budget": "Calculate Budget",
        "Advanced Fraud Alerts": "Advanced Fraud Alerts",
        "Check Security Alerts": "Check Security Alerts",
        "Customer Support Tickets": "Customer Support Tickets",
        "Create Ticket": "Create Ticket",
        "Virtual Debit Card": "Virtual Debit Card",
        "Generate Demo Card": "Generate Demo Card",
        "Scheduled Transfers": "Scheduled Transfers",
        "Schedule Demo Transfer": "Schedule Demo Transfer",
        "Financial Health Score": "Financial Health Score",
        "Analyze Financial Health": "Analyze Financial Health",
        "Multi Account Management": "Multi Account Management",
        "Add Account": "Add Account",
        "Multi Currency Wallet": "Multi Currency Wallet",
        "Convert Demo Currency": "Convert Demo Currency",
        "Digital Document Vault": "Digital Document Vault",
        "Upload Document": "Upload Document",
        "Advanced Admin Analytics": "Advanced Admin Analytics",
        "Load Analytics": "Load Analytics",
        "Admin panel": "Admin panel",
        "Load admin data": "Load admin data",
        "PROJECT MODULES": "PROJECT MODULES",
        "One demo. Multiple workflows.": "One demo. Multiple workflows.",
        "Account Access": "Account Access",
        "Recovery": "Recovery",
        "Risk Engine": "Risk Engine",
        "Service Desk": "Service Desk"
    },

    ta: {
        "Features": "சிறப்பம்சங்கள்",
        "Logout": "வெளியேறு",
        "Create account": "கணக்கை உருவாக்கு",
        "Login": "உள்நுழை",
        "Close": "மூடு",
        "Continue": "தொடரவும்",
        "Name": "பெயர்",
        "Email": "மின்னஞ்சல்",
        "Password": "கடவுச்சொல்",
        "Welcome, ": "வரவேற்கிறோம், ",
        "Demo environment": "செய்முறை சூழல்",
        "Demo balance": "செய்முறை இருப்பு",
        "Account status": "கணக்கு நிலை",
        "Protection": "பாதுகாப்பு",
        "Select Your Bank": "உங்கள் வங்கியைத் தேர்வு செய்யவும்",
        "Search bank": "வங்கியைத் தேடவும்",
        "Available banks": "கிடைக்கும் வங்கிகள்",
        "Save Bank Selection": "வங்கி தேர்வைச் சேமிக்கவும்",
        "Simulated transfer": "மாதிரி பணப் பரிமாற்றம்",
        "Recipient": "பெறுநர்",
        "Amount (₹)": "தொகை (₹)",
        "Run demo transfer": "மாதிரி பரிமாற்றத்தைச் செய்யவும்",
        "Account recovery": "கணக்கு மீட்பு",
        "Generate demo OTP": "மாதிரி OTP உருவாக்கவும்",
        "Verify and unlock": "சரிபார்த்து திறக்கவும்",
        "Apply for service": "சேவைக்கு விண்ணப்பிக்கவும்",
        "Submit application": "விண்ணப்பத்தைச் சமர்ப்பிக்கவும்",
        "Notifications": "அறிவிப்புகள்",
        "Security centre": "பாதுகாப்பு மையம்",
        "Banking FAQ chatbot": "வங்கி உதவி சாட்பாட்",
        "Ask": "கேட்கவும்",
        "Recent transactions": "சமீபத்திய பரிவர்த்தனைகள்",
        "Refresh": "புதுப்பிக்கவும்",
        "Monthly spending (demo)": "மாதாந்திர செலவு (மாதிரி)",
        "Face Recognition Login": "முக அடையாள உள்நுழைவு",
        "Start Camera": "கேமராவைத் தொடங்கு",
        "Verify Face": "முகத்தைச் சரிபார்க்கவும்",
        "QR Payment": "QR பணம் செலுத்துதல்",
        "Generate QR": "QR உருவாக்கவும்",
        "Investment Portfolio": "முதலீட்டு தொகுப்பு",
        "Add Demo Investment": "மாதிரி முதலீட்டைச் சேர்க்கவும்",
        "Credit Score Simulator": "கடன் மதிப்பெண் கணிப்பான்",
        "Calculate Score": "மதிப்பெண்ணைக் கணக்கிடவும்",
        "Recurring Payments": "தொடர் கட்டணங்கள்",
        "Add Recurring Payment": "தொடர் கட்டணத்தைச் சேர்க்கவும்",
        "Smart Budget Planner": "ஸ்மார்ட் பட்ஜெட் திட்டமிடல்",
        "Calculate Budget": "பட்ஜெட்டைக் கணக்கிடவும்",
        "Advanced Fraud Alerts": "மேம்பட்ட மோசடி எச்சரிக்கைகள்",
        "Check Security Alerts": "பாதுகாப்பு எச்சரிக்கைகளைச் சரிபார்க்கவும்",
        "Customer Support Tickets": "வாடிக்கையாளர் உதவி கோரிக்கைகள்",
        "Create Ticket": "கோரிக்கையை உருவாக்கவும்",
        "Virtual Debit Card": "மெய்நிகர் டெபிட் கார்டு",
        "Generate Demo Card": "மாதிரி அட்டையை உருவாக்கவும்",
        "Scheduled Transfers": "திட்டமிடப்பட்ட பரிமாற்றங்கள்",
        "Schedule Demo Transfer": "மாதிரி பரிமாற்றத்தைத் திட்டமிடவும்",
        "Financial Health Score": "நிதி ஆரோக்கிய மதிப்பெண்",
        "Analyze Financial Health": "நிதி நிலையைப் பகுப்பாய்வு செய்யவும்",
        "Multi Account Management": "பல கணக்கு மேலாண்மை",
        "Add Account": "கணக்கைச் சேர்க்கவும்",
        "Multi Currency Wallet": "பல நாணய பணப்பை",
        "Convert Demo Currency": "மாதிரி நாணயத்தை மாற்றவும்",
        "Digital Document Vault": "டிஜிட்டல் ஆவண சேமிப்பு",
        "Upload Document": "ஆவணத்தைப் பதிவேற்றவும்",
        "Advanced Admin Analytics": "மேம்பட்ட நிர்வாகப் பகுப்பாய்வு",
        "Load Analytics": "பகுப்பாய்வை ஏற்றவும்",
        "Admin panel": "நிர்வாகப் பலகை",
        "Load admin data": "நிர்வாகத் தரவை ஏற்றவும்",
        "PROJECT MODULES": "திட்டப் பிரிவுகள்",
        "One demo. Multiple workflows.": "ஒரே மாதிரி திட்டம். பல செயல்பாடுகள்.",
        "Account Access": "கணக்கு அணுகல்",
        "Recovery": "மீட்பு",
        "Risk Engine": "இடர் மதிப்பீட்டு அமைப்பு",
        "Service Desk": "சேவை மையம்"
    },

    hi: {
        "Features": "विशेषताएँ",
        "Logout": "लॉग आउट",
        "Create account": "खाता बनाएँ",
        "Login": "लॉग इन",
        "Close": "बंद करें",
        "Continue": "जारी रखें",
        "Name": "नाम",
        "Email": "ईमेल",
        "Password": "पासवर्ड",
        "Welcome, ": "स्वागत है, ",
        "Demo environment": "डेमो वातावरण",
        "Demo balance": "डेमो बैलेंस",
        "Account status": "खाते की स्थिति",
        "Protection": "सुरक्षा",
        "Select Your Bank": "अपना बैंक चुनें",
        "Search bank": "बैंक खोजें",
        "Available banks": "उपलब्ध बैंक",
        "Save Bank Selection": "बैंक चयन सहेजें",
        "Simulated transfer": "डेमो ट्रांसफर",
        "Recipient": "प्राप्तकर्ता",
        "Amount (₹)": "राशि (₹)",
        "Run demo transfer": "डेमो ट्रांसफर करें",
        "Account recovery": "खाता पुनर्प्राप्ति",
        "Generate demo OTP": "डेमो OTP बनाएँ",
        "Verify and unlock": "सत्यापित करें और अनलॉक करें",
        "Apply for service": "सेवा के लिए आवेदन करें",
        "Submit application": "आवेदन जमा करें",
        "Notifications": "सूचनाएँ",
        "Security centre": "सुरक्षा केंद्र",
        "Banking FAQ chatbot": "बैंकिंग सहायता चैटबॉट",
        "Ask": "पूछें",
        "Recent transactions": "हाल के लेनदेन",
        "Refresh": "रिफ्रेश करें",
        "Monthly spending (demo)": "मासिक खर्च (डेमो)",
        "Face Recognition Login": "चेहरा पहचान लॉगिन",
        "Start Camera": "कैमरा शुरू करें",
        "Verify Face": "चेहरा सत्यापित करें",
        "QR Payment": "QR भुगतान",
        "Generate QR": "QR बनाएँ",
        "Investment Portfolio": "निवेश पोर्टफोलियो",
        "Add Demo Investment": "डेमो निवेश जोड़ें",
        "Credit Score Simulator": "क्रेडिट स्कोर सिम्युलेटर",
        "Calculate Score": "स्कोर की गणना करें",
        "Recurring Payments": "आवर्ती भुगतान",
        "Add Recurring Payment": "आवर्ती भुगतान जोड़ें",
        "Smart Budget Planner": "स्मार्ट बजट योजनाकार",
        "Calculate Budget": "बजट की गणना करें",
        "Advanced Fraud Alerts": "उन्नत धोखाधड़ी अलर्ट",
        "Check Security Alerts": "सुरक्षा अलर्ट जाँचें",
        "Customer Support Tickets": "ग्राहक सहायता टिकट",
        "Create Ticket": "टिकट बनाएँ",
        "Virtual Debit Card": "वर्चुअल डेबिट कार्ड",
        "Generate Demo Card": "डेमो कार्ड बनाएँ",
        "Scheduled Transfers": "निर्धारित ट्रांसफर",
        "Schedule Demo Transfer": "डेमो ट्रांसफर शेड्यूल करें",
        "Financial Health Score": "वित्तीय स्वास्थ्य स्कोर",
        "Analyze Financial Health": "वित्तीय स्वास्थ्य का विश्लेषण करें",
        "Multi Account Management": "मल्टी अकाउंट प्रबंधन",
        "Add Account": "खाता जोड़ें",
        "Multi Currency Wallet": "मल्टी करेंसी वॉलेट",
        "Convert Demo Currency": "डेमो मुद्रा बदलें",
        "Digital Document Vault": "डिजिटल दस्तावेज़ वॉल्ट",
        "Upload Document": "दस्तावेज़ अपलोड करें",
        "Advanced Admin Analytics": "उन्नत एडमिन विश्लेषण",
        "Load Analytics": "विश्लेषण लोड करें",
        "Admin panel": "एडमिन पैनल",
        "Load admin data": "एडमिन डेटा लोड करें",
        "PROJECT MODULES": "प्रोजेक्ट मॉड्यूल",
        "One demo. Multiple workflows.": "एक डेमो। कई कार्यप्रवाह।",
        "Account Access": "खाता पहुँच",
        "Recovery": "पुनर्प्राप्ति",
        "Risk Engine": "जोखिम इंजन",
        "Service Desk": "सेवा डेस्क"
    }
};

// Other languages are registered here.
// Their labels appear in the dropdown. Add their phrase translations
// to this object to translate the matching interface text.

const SMARTBANK_LANGUAGE_NAMES = {
    en: "English",
    ta: "தமிழ்",
    hi: "हिन्दी",
    te: "తెలుగు",
    ml: "മലയാളം",
    kn: "ಕನ್ನಡ",
    bn: "বাংলা",
    mr: "मराठी",
    gu: "ગુજરાતી",
    pa: "ਪੰਜਾਬੀ",
    ur: "اردو",
    ne: "नेपाली",
    es: "Español",
    fr: "Français",
    de: "Deutsch",
    ar: "العربية",
    "zh-CN": "中文",
    ja: "日本語",
    ko: "한국어",
    pt: "Português",
    ru: "Русский",
    it: "Italiano",
    id: "Bahasa Indonesia",
    th: "ไทย",
    tr: "Türkçe"
};

const SMARTBANK_LANG_KEY = "smartbank_selected_language";

let smartbankCurrentLanguage =
    localStorage.getItem(SMARTBANK_LANG_KEY) || "en";

const smartbankOriginalText = new WeakMap();
const smartbankOriginalAttributes = new WeakMap();

function smartbankTranslateTextNode(node) {
    if (!node || !node.parentElement) return;

    const raw = node.textContent;
    if (!raw || !raw.trim()) return;

    let saved = smartbankOriginalText.get(node);

    if (!saved) {
        saved = {
            original: raw,
            translated: null
        };
    } else if (saved.translated !== null &&
               raw !== saved.translated) {
        // The application changed this text dynamically.
        saved.original = raw;
        saved.translated = null;
    }

    const dictionary =
        SMARTBANK_LANGUAGES[smartbankCurrentLanguage] || {};

    const originalTrimmed = saved.original.trim();
    const translated = dictionary[originalTrimmed];

    if (translated !== undefined) {
        const leading = saved.original.match(/^\s*/)?.[0] || "";
        const trailing = saved.original.match(/\s*$/)?.[0] || "";

        node.textContent = leading + translated + trailing;
        saved.translated = node.textContent;
    } else if (saved.translated !== null) {
        node.textContent = saved.original;
        saved.translated = null;
    }

    smartbankOriginalText.set(node, saved);
}

function smartbankTranslateAttributes(element) {
    const dictionary =
        SMARTBANK_LANGUAGES[smartbankCurrentLanguage] || {};

    const attributes = [
        "placeholder",
        "title",
        "aria-label"
    ];

    attributes.forEach(attribute => {
        if (!element.hasAttribute(attribute)) return;

        let saved = smartbankOriginalAttributes.get(element);

        if (!saved) {
            saved = {};
            smartbankOriginalAttributes.set(element, saved);
        }

        const current = element.getAttribute(attribute);

        if (!(attribute in saved)) {
            saved[attribute] = current;
        } else if (
            saved[attribute + "_translated"] &&
            current !== saved[attribute + "_translated"]
        ) {
            saved[attribute] = current;
        }

        const translated = dictionary[saved[attribute]];

        if (translated !== undefined) {
            element.setAttribute(attribute, translated);
            saved[attribute + "_translated"] = translated;
        } else {
            element.setAttribute(attribute, saved[attribute]);
            saved[attribute + "_translated"] = null;
        }
    });
}

function smartbankTranslatePage() {
    const root = document.body;
    if (!root) return;

    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT
    );

    const nodes = [];

    while (walker.nextNode()) {
        nodes.push(walker.currentNode);
    }

    nodes.forEach(smartbankTranslateTextNode);

    root.querySelectorAll("*").forEach(
        smartbankTranslateAttributes
    );

    document.documentElement.lang =
        smartbankCurrentLanguage;
}

function smartbankChangeLanguage(language) {
    if (!SMARTBANK_LANGUAGE_NAMES[language]) return;

    smartbankCurrentLanguage = language;

    localStorage.setItem(
        SMARTBANK_LANG_KEY,
        language
    );

    const observer = window.smartbankTranslationObserver;

    if (observer) observer.disconnect();

    smartbankTranslatePage();

    if (observer) {
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }
}

function smartbankInitLanguages() {
    const selector = $("languageSelect");
    if (!selector) return;

    selector.value = smartbankCurrentLanguage;

    selector.addEventListener("change", event => {
        smartbankChangeLanguage(event.target.value);
    });

    smartbankTranslatePage();

    const observer = new MutationObserver(() => {
        observer.disconnect();
        smartbankTranslatePage();

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    });

    window.smartbankTranslationObserver = observer;

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });
}

smartbankInitLanguages();

const SMARTBANK_TRANSLATIONS = {
  en: {
    dashboard: "Dashboard",
    account: "Account",
    transfer: "Transfer Money",
    transactions: "Transactions",
    balance: "Available Balance",
    settings: "Settings",
    logout: "Logout",
    notifications: "Notifications",
    support: "Customer Support",
    security: "Security",
    applications: "Applications",
    welcome: "Welcome to SmartBank AI"
  },
  ta: {
    dashboard: "முகப்புப் பலகை",
    account: "கணக்கு",
    transfer: "பணம் அனுப்புதல்",
    transactions: "பரிவர்த்தனைகள்",
    balance: "கிடைக்கும் இருப்பு",
    settings: "அமைப்புகள்",
    logout: "வெளியேறு",
    notifications: "அறிவிப்புகள்",
    support: "வாடிக்கையாளர் உதவி",
    security: "பாதுகாப்பு",
    applications: "விண்ணப்பங்கள்",
    welcome: "SmartBank AI-க்கு வரவேற்கிறோம்"
  },
  hi: {
    dashboard: "डैशबोर्ड",
    account: "खाता",
    transfer: "पैसे भेजें",
    transactions: "लेनदेन",
    balance: "उपलब्ध शेष राशि",
    settings: "सेटिंग्स",
    logout: "लॉग आउट",
    notifications: "सूचनाएं",
    support: "ग्राहक सहायता",
    security: "सुरक्षा",
    applications: "आवेदन",
    welcome: "SmartBank AI में आपका स्वागत है"
  },
  te: {
    dashboard: "డాష్‌బోర్డ్",
    account: "ఖాతా",
    transfer: "డబ్బు పంపండి",
    transactions: "లావాదేవీలు",
    balance: "అందుబాటులో ఉన్న బ్యాలెన్స్",
    settings: "సెట్టింగులు",
    logout: "లాగ్ అవుట్",
    notifications: "నోటిఫికేషన్లు",
    support: "కస్టమర్ సపోర్ట్",
    security: "భద్రత",
    applications: "దరఖాస్తులు",
    welcome: "SmartBank AI కి స్వాగతం"
  },
  ml: {
    dashboard: "ഡാഷ്ബോർഡ്",
    account: "അക്കൗണ്ട്",
    transfer: "പണം അയയ്ക്കുക",
    transactions: "ഇടപാടുകൾ",
    balance: "ലഭ്യമായ ബാലൻസ്",
    settings: "ക്രമീകരണങ്ങൾ",
    logout: "ലോഗ് ഔട്ട്",
    notifications: "അറിയിപ്പുകൾ",
    support: "ഉപഭോക്തൃ സഹായം",
    security: "സുരക്ഷ",
    applications: "അപേക്ഷകൾ",
    welcome: "SmartBank AI-യിലേക്ക് സ്വാഗതം"
  },
  kn: {
    dashboard: "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್",
    account: "ಖಾತೆ",
    transfer: "ಹಣ ವರ್ಗಾಯಿಸಿ",
    transactions: "ವಹಿವಾಟುಗಳು",
    balance: "ಲಭ್ಯವಿರುವ ಬ್ಯಾಲೆನ್ಸ್",
    settings: "ಸೆಟ್ಟಿಂಗ್‌ಗಳು",
    logout: "ಲಾಗ್ ಔಟ್",
    notifications: "ಅಧಿಸೂಚನೆಗಳು",
    support: "ಗ್ರಾಹಕ ಬೆಂಬಲ",
    security: "ಭದ್ರತೆ",
    applications: "ಅರ್ಜಿಗಳು",
    welcome: "SmartBank AI ಗೆ ಸ್ವಾಗತ"
  }
};


function getSmartBankLanguage() {
  return localStorage.getItem("smartbank_selected_language") || "en";
}

function smartBankTranslate(key) {
  const lang = getSmartBankLanguage();
  return SMARTBANK_TRANSLATIONS[lang]?.[key]
      || SMARTBANK_TRANSLATIONS.en[key]
      || key;
}

function changeSmartBankLanguage(lang) {
  if (!SMARTBANK_LANGUAGE_NAMES[lang]) return;

  localStorage.setItem("smartbank_selected_language", lang);
  document.documentElement.lang = lang;

  const selector = document.getElementById("languageSelector");
  if (selector) selector.value = lang;

  document.querySelectorAll("[data-i18n]").forEach(element => {
    const key = element.getAttribute("data-i18n");
    const translated = smartBankTranslate(key);
    if (translated !== key) element.textContent = translated;
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(element => {
    const key = element.getAttribute("data-i18n-placeholder");
    const translated = smartBankTranslate(key);
    if (translated !== key) element.placeholder = translated;
  });
}

function initializeSmartBankLanguages() {
  const lang = getSmartBankLanguage();
  const selector = document.getElementById("languageSelector");

  if (selector) selector.value = lang;

  changeSmartBankLanguage(lang);
}

document.addEventListener("DOMContentLoaded", initializeSmartBankLanguages);