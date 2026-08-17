/* ==========================================================================
   JOURNAL LOGIC
   Entries are public: anyone visiting this page can read them. Writing,
   editing, and deleting requires the passcode below. All data lives in this
   browser's localStorage, there is no server and no sync between devices,
   so entries posted from one browser will not appear on another visitor's
   screen. The passcode is a light deterrent against casual editing, not
   real security, since anyone can read this file's source.

   TO SET YOUR OWN PASSCODE:
   1. Open any browser's developer console on any page.
   2. Run:
        crypto.subtle.digest("SHA-256", new TextEncoder().encode("yourpassword"))
          .then(buf => console.log(Array.from(new Uint8Array(buf))
          .map(b => b.toString(16).padStart(2, "0")).join("")));
   3. Copy the printed hash and paste it as PASSCODE_HASH below.
   Default passcode is: journal
   ========================================================================== */

const PASSCODE_HASH = "81dd6b775afcccb6dbb8a25a58ea844271bbefaeea7cb1d91c1687d7450f850c";
const SESSION_KEY = "journal_unlocked";
const ENTRIES_KEY = "journal_entries";
const MAX_IMAGE_WIDTH = 1400;
const IMAGE_QUALITY = 0.82;

let entries = [];
let activeFilter = "All";
let editingId = null;
let pendingImage = null; // holds a data URL while composing an entry
let isAdmin = false;

/* ---------- Storage ---------- */

function getSeedEntries() {
    return [
        {
            id: "seed-3",
            title: "A Field Guide to Indonesian Coffee, From Someone Who Grew Up On It",
            category: "Life & Culture",
            date: "2026-03-10",
            content: "Indonesia grows some of the most distinct coffee in the world, and most of it never gets exported far enough for people to notice. Sumatra's Aceh Gayo is the one worth starting with: earthy, low acid, full bodied, usually processed with the wet-hulling method that gives Indonesian coffee its signature heavy mouthfeel. From there, Toraja from Sulawesi leans sweeter and more balanced, while Bali Kintamani, grown alongside citrus trees, tends to pick up a brighter, almost citrus-adjacent note that surprises people expecting another heavy Sumatran cup.\n\nOn the cafe side, Jakarta's specialty scene has grown into one of the more serious ones in Southeast Asia. Giyanti Coffee Roastery in Menteng is a good starting point, part roastery and part old Javanese sitting room, and one of the reference points for the city's third-wave scene. Kopi Kalyan in Gandaria roasts direct-trade lots from across the archipelago and is worth a visit for anyone who wants to taste single origins side by side. For a reliable daily cup, South Jakarta has no shortage of solid neighborhood roasters worth working through one by one.",
            image: null,
        },
        {
            id: "seed-2",
            title: "What Watching the Market Has Taught Me About Systems Thinking",
            category: "Article",
            date: "2026-04-22",
            content: "I got into following the stock market the same way I got into debugging, by trying to find the pattern underneath the noise. The parallels to engineering are hard to miss: a market is a distributed system with millions of independent agents, feedback loops, and lag, and most of what looks like chaos day to day is actually the system re-equilibrating around new information.\n\nThe habit that has translated best from CS to markets is distrust of a single clean signal. One earnings beat, one headline, one indicator rarely tells the whole story, the same way one passing test case does not mean the system is correct. I am not a financial professional and none of this is investment advice, just notes from treating market watching as another kind of systems problem worth understanding.",
            image: null,
        },
        {
            id: "seed-1",
            title: "Where On-Device AI Is Actually Heading",
            category: "Technology",
            date: "2026-06-02",
            content: "Most of the AI conversation over the past few years has been about scale: bigger models, bigger clusters, bigger training runs. But the more interesting shift happening right now runs the other way, toward models small enough to run locally on a phone or laptop, doing real work without a round trip to a data center. For anyone building software, that changes the default assumption from calling an API to asking what can run on-device and what actually needs the cloud.\n\nThat shift matters for latency and privacy, but it also changes how systems get designed. Features that used to require a network call, such as transcription, translation, and image cleanup, can now sit inside the app itself. As someone who spends a lot of time in image processing and systems work, I find this the most practically interesting trend in the field right now, not the frontier models, but how much capability is quietly moving closer to the hardware.",
            image: null,
        },
    ];
}

function loadEntries() {
    try {
        const raw = localStorage.getItem(ENTRIES_KEY);
        if (raw) {
            entries = JSON.parse(raw);
        } else {
            entries = getSeedEntries();
            persistEntries();
        }
    } catch (err) {
        entries = [];
    }
}

function persistEntries() {
    try {
        localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
        return true;
    } catch (err) {
        showFormError("Could not save. Your browser's storage is full, try removing an image from an older entry or deleting an entry.");
        return false;
    }
}

/* ---------- Passcode modal / admin mode ---------- */

async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function openModal() {
    document.getElementById("passcode-modal").hidden = false;
    document.getElementById("passcode-input").value = "";
    document.getElementById("lock-error").hidden = true;
    document.getElementById("passcode-input").focus();
}

function closeModal() {
    document.getElementById("passcode-modal").hidden = true;
}

function enterAdminMode() {
    isAdmin = true;
    sessionStorage.setItem(SESSION_KEY, "true");
    document.getElementById("write-blog-btn").hidden = true;
    document.getElementById("exit-admin-btn").hidden = false;
    document.getElementById("entry-form-card").hidden = false;
    renderEntries();
}

function exitAdminMode() {
    isAdmin = false;
    sessionStorage.removeItem(SESSION_KEY);
    document.getElementById("write-blog-btn").hidden = false;
    document.getElementById("exit-admin-btn").hidden = true;
    document.getElementById("entry-form-card").hidden = true;
    resetForm();
    renderEntries();
}

document.getElementById("write-blog-btn").addEventListener("click", () => {
    if (isAdmin) {
        document.getElementById("entry-form-card").hidden = false;
        document.getElementById("entry-form-card").scrollIntoView({ behavior: "smooth" });
    } else {
        openModal();
    }
});

document.getElementById("exit-admin-btn").addEventListener("click", exitAdminMode);
document.getElementById("modal-cancel-btn").addEventListener("click", closeModal);

document.getElementById("lock-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = document.getElementById("passcode-input").value;
    const hash = await sha256Hex(value);
    const errorEl = document.getElementById("lock-error");
    if (hash === PASSCODE_HASH) {
        errorEl.hidden = true;
        closeModal();
        enterAdminMode();
        document.getElementById("entry-form-card").scrollIntoView({ behavior: "smooth" });
    } else {
        errorEl.hidden = false;
    }
});

/* ---------- Image handling ---------- */

function resizeImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > MAX_IMAGE_WIDTH) {
                    height = Math.round((height * MAX_IMAGE_WIDTH) / width);
                    width = MAX_IMAGE_WIDTH;
                }
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                canvas.getContext("2d").drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL("image/jpeg", IMAGE_QUALITY));
            };
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

document.getElementById("entry-image").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        pendingImage = await resizeImage(file);
        document.getElementById("image-preview").src = pendingImage;
        document.getElementById("image-preview-wrap").hidden = false;
    } catch (err) {
        showFormError("Could not read that image, try a different file.");
    }
});

document.getElementById("remove-image-btn").addEventListener("click", () => {
    pendingImage = null;
    document.getElementById("entry-image").value = "";
    document.getElementById("image-preview-wrap").hidden = true;
});

/* ---------- Form ---------- */

function showFormError(msg) {
    const el = document.getElementById("form-error");
    el.textContent = msg;
    el.hidden = false;
}

function clearFormError() {
    const el = document.getElementById("form-error");
    el.hidden = true;
    el.textContent = "";
}

function resetForm() {
    document.getElementById("entry-form").reset();
    document.getElementById("entry-date").value = new Date().toISOString().slice(0, 10);
    pendingImage = null;
    document.getElementById("image-preview-wrap").hidden = true;
    editingId = null;
    document.getElementById("entry-form-title").textContent = "New Entry";
    document.getElementById("save-entry-btn").textContent = "Save and Post";
    document.getElementById("cancel-edit-btn").hidden = true;
    clearFormError();
}

document.getElementById("entry-form").addEventListener("submit", (e) => {
    e.preventDefault();
    clearFormError();

    const title = document.getElementById("entry-title").value.trim();
    const category = document.getElementById("entry-category").value;
    const date = document.getElementById("entry-date").value;
    const content = document.getElementById("entry-content").value.trim();

    if (!title || !content || !date) {
        showFormError("Please fill in the title, date, and entry text.");
        return;
    }

    if (editingId) {
        const entry = entries.find((en) => en.id === editingId);
        if (entry) {
            entry.title = title;
            entry.category = category;
            entry.date = date;
            entry.content = content;
            if (pendingImage !== null) entry.image = pendingImage;
        }
    } else {
        entries.unshift({
            id: String(Date.now()),
            title,
            category,
            date,
            content,
            image: pendingImage,
        });
    }

    if (persistEntries()) {
        resetForm();
        renderEntries();
    }
});

document.getElementById("cancel-edit-btn").addEventListener("click", resetForm);

/* ---------- Filter ---------- */

document.getElementById("filter-bar").addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-pill");
    if (!btn) return;
    activeFilter = btn.getAttribute("data-filter");
    document.querySelectorAll(".filter-pill").forEach((p) => p.classList.toggle("active", p === btn));
    renderEntries();
});

/* ---------- Render ---------- */

function formatDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function renderEntries() {
    const list = document.getElementById("entry-list");
    const emptyState = document.getElementById("empty-state");
    const visible = activeFilter === "All" ? entries : entries.filter((en) => en.category === activeFilter);

    list.innerHTML = "";

    if (visible.length === 0) {
        emptyState.hidden = false;
        return;
    }
    emptyState.hidden = true;

    visible.forEach((entry) => {
        const card = document.createElement("article");
        card.className = "entry-card";
        card.innerHTML = `
            ${entry.image ? `<img src="${entry.image}" alt="${escapeHtml(entry.title)}">` : ""}
            <h3>${escapeHtml(entry.title)}</h3>
            <p class="entry-meta">${escapeHtml(entry.category)} &middot; ${formatDate(entry.date)}</p>
            <p class="entry-body">${escapeHtml(entry.content)}</p>
            ${isAdmin ? `
            <div class="entry-actions">
                <button class="btn-text" data-action="edit" data-id="${entry.id}">Edit</button>
                <button class="btn-danger" data-action="delete" data-id="${entry.id}">Delete</button>
            </div>` : ""}
        `;
        list.appendChild(card);
    });
}

document.getElementById("entry-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    const action = btn.getAttribute("data-action");

    if (action === "delete") {
        if (confirm("Delete this entry? This cannot be undone.")) {
            entries = entries.filter((en) => en.id !== id);
            persistEntries();
            renderEntries();
        }
    } else if (action === "edit") {
        const entry = entries.find((en) => en.id === id);
        if (!entry) return;
        editingId = id;
        document.getElementById("entry-title").value = entry.title;
        document.getElementById("entry-category").value = entry.category;
        document.getElementById("entry-date").value = entry.date;
        document.getElementById("entry-content").value = entry.content;
        pendingImage = null;
        if (entry.image) {
            document.getElementById("image-preview").src = entry.image;
            document.getElementById("image-preview-wrap").hidden = false;
        } else {
            document.getElementById("image-preview-wrap").hidden = true;
        }
        document.getElementById("entry-form-title").textContent = "Edit Entry";
        document.getElementById("save-entry-btn").textContent = "Update Entry";
        document.getElementById("cancel-edit-btn").hidden = false;
        document.getElementById("entry-form-card").hidden = false;
        document.getElementById("entry-form-card").scrollIntoView({ behavior: "smooth" });
    }
});

/* ---------- Init ---------- */

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("entry-date").value = new Date().toISOString().slice(0, 10);
    loadEntries();
    if (sessionStorage.getItem(SESSION_KEY) === "true") {
        enterAdminMode();
    } else {
        renderEntries();
    }
});