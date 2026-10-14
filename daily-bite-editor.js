(() => {
  const api = "https://api.github.com/repos/luckydayla/englishdaydayup-words";
  const editor = document.querySelector("#biteEditor");
  const addButton = document.querySelector("#addBite");
  let editingId = null;

  const style = document.createElement("style");
  style.textContent = `.bite-editor{display:none;margin:-12px 0 30px;padding:22px;border:1px solid var(--line);background:var(--card)}.bite-editor.open{display:block}.bite-editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.bite-editor label{display:grid;gap:6px;color:var(--muted);font-size:11px;font-weight:700}.bite-editor .wide{grid-column:1/-1}.bite-editor input,.bite-editor textarea{width:100%;padding:11px;border:1px solid var(--line);background:var(--paper);font:14px/1.45 Arial}.bite-editor textarea{min-height:150px;resize:vertical}.bite-editor-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:14px}.bite-editor-note{margin:12px 0 0;color:var(--muted);font-size:11px}.bite-editor-status{margin:12px 0 0;color:var(--accent);font-size:12px;font-weight:700}.bite-card-actions{display:flex;gap:12px;margin-top:18px}.bite-card-actions button{padding:7px 10px;border:1px solid var(--line);background:transparent;font-weight:700}@media(max-width:600px){.bite-editor-grid{grid-template-columns:1fr}.bite-editor .wide{grid-column:auto}}`;
  document.head.appendChild(style);
  editor.innerHTML = `<div class="bite-editor"><div class="bite-editor-grid"><label>Date<input id="biteEditDate" type="date"></label><label>Title<input id="biteEditTitle" value="Daily Bite"></label><label class="wide">Content<textarea id="biteEditContent"></textarea></label><label>Original/source URL<input id="biteEditUrl" type="url" placeholder="https://…"></label><label>Tags<input id="biteEditTags" placeholder="leadership, strategy"></label><label class="wide">GitHub token<input id="biteEditToken" type="password" autocomplete="off" placeholder="Fine-grained token with Contents write access"></label></div><p class="bite-editor-note">The token is saved only in this browser and is never added to the website files.</p><p class="bite-editor-status" id="biteEditStatus"></p><div class="bite-editor-actions"><button class="secondary" id="cancelBite">Cancel</button><button class="primary" id="saveBite">Save Daily Bite</button></div></div>`;
  const form = editor.firstElementChild;
  const field = id => document.querySelector(`#${id}`);
  field("biteEditToken").value = localStorage.getItem("ddu-github-token") || "";

  function openEditor(bite) {
    editingId = bite?.id || null;
    field("biteEditDate").value = bite?.date || selected;
    field("biteEditTitle").value = bite?.title || "Daily Bite";
    field("biteEditContent").value = bite?.content || "";
    field("biteEditUrl").value = bite?.sourceUrl || "";
    field("biteEditTags").value = (bite?.tags || []).join(", ");
    field("biteEditStatus").textContent = "";
    form.classList.add("open");
    field("biteEditContent").focus();
  }
  function closeEditor() { form.classList.remove("open"); editingId = null; }
  addButton.onclick = () => openEditor();
  field("cancelBite").onclick = closeEditor;

  const encode = value => btoa(unescape(encodeURIComponent(value)));
  async function githubJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(response.status === 401 ? "The GitHub token is invalid or expired." : `GitHub returned ${response.status}.`);
    return response.json();
  }

  loadBites = async function () {
    try {
      const files = await githubJson(`${api}/contents/daily-bites?ref=main`);
      const records = await Promise.all(files.filter(file => file.name.endsWith(".json")).map(async file => {
        const response = await fetch(file.download_url, { cache: "no-store" });
        const record = await response.json();
        return { ...record, _path: file.path, _sha: file.sha };
      }));
      dailyBites = records.filter(b => b.id && b.date && b.title && b.content);
      biteStatus = "ready";
      dates = [...new Set([...vocabDates, ...dailyBites.map(b => b.date)])].sort();
      render();
    } catch {
      biteStatus = "error";
      render();
    }
  };

  renderBites = function () {
    const list = document.querySelector("#biteList");
    const items = dailyBites.filter(b => b.date === selected).sort((a, b) => (b.createdAt || b.id).localeCompare(a.createdAt || a.id));
    document.querySelector("#biteDate").textContent = `Ideas worth keeping · ${pretty(selected)}`;
    if (biteStatus === "loading") { list.className = "empty"; list.textContent = "Loading your Daily Bites…"; return; }
    if (biteStatus === "error") { list.className = "empty"; list.textContent = "Daily Bites could not be loaded. Please refresh and try again."; return; }
    if (!items.length) { list.className = "empty"; list.innerHTML = "<strong>No Daily Bite for this date yet.</strong>"; return; }
    list.className = "bite-grid";
    list.innerHTML = items.map(b => {
      const sourceUrl = safeUrl(b.sourceUrl), sourceLabel = visibleSource(b.source);
      return `<article class="bite-card"><div class="bite-meta"><span>${esc(pretty(b.date))}</span>${sourceLabel ? `<span>${esc(sourceLabel)}</span>` : ""}</div><h3>${esc(b.title)}</h3><div class="bite-content">${b.content.split(/\n+/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join("")}</div>${b.tags?.length ? `<div class="bite-words">${b.tags.map(tag => `<span>${esc(tag)}</span>`).join("")}</div>` : ""}${sourceUrl ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noreferrer">Open source ↗</a>` : ""}<div class="bite-card-actions"><button data-edit-bite="${esc(b.id)}">Edit</button></div></article>`;
    }).join("");
    list.querySelectorAll("[data-edit-bite]").forEach(button => button.onclick = () => openEditor(dailyBites.find(b => b.id === button.dataset.editBite)));
  };

  field("saveBite").onclick = async () => {
    const token = field("biteEditToken").value.trim();
    const content = field("biteEditContent").value.trim();
    const date = field("biteEditDate").value;
    if (!token || !content || !date) { field("biteEditStatus").textContent = "Date, content and GitHub token are required."; return; }
    localStorage.setItem("ddu-github-token", token);
    const existing = dailyBites.find(b => b.id === editingId);
    const id = existing?.id || `${date}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const path = existing?._path || `daily-bites/${id}.json`;
    const record = { ...existing, id, date, title: field("biteEditTitle").value.trim() || "Daily Bite", content, sourceUrl: field("biteEditUrl").value.trim(), tags: field("biteEditTags").value.split(",").map(tag => tag.trim()).filter(Boolean), source: existing?.source || "DDU GitHub editor", createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    delete record._path; delete record._sha;
    field("biteEditStatus").textContent = "Saving…";
    try {
      await githubJson(`${api}/contents/${path}`, { method: "PUT", headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" }, body: JSON.stringify({ message: `${existing ? "Update" : "Add"} Daily Bite: ${record.title}`, content: encode(JSON.stringify(record, null, 2)), branch: "main", ...(existing?._sha ? { sha: existing._sha } : {}) }) });
      closeEditor();
      biteStatus = "loading";
      renderBites();
      await loadBites();
    } catch (error) { field("biteEditStatus").textContent = error.message; }
  };

  biteStatus = "loading";
  loadBites();
})();
