/* IndexedDB: article snapshots and image bytes are stored separately. */
(function (root) {
  "use strict";
  class DraftStore {
    constructor(factory = root.indexedDB) { this.factory = factory; this.imageBytes = new WeakMap(); }
    open() {
      return this.connection ||= new Promise((resolve, reject) => {
        const request = this.factory.open("xenoah-blog-studio", 2);
        request.onupgradeneeded = () => {
          for (const name of ["drafts", "documents", "assets", "settings"]) {
            if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); this.connection = null; };
          resolve(db);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("古いエディターのタブを閉じて再読み込みしてください。"));
      });
    }
    async get(store, key) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const request = db.transaction(store).objectStore(store).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    async setting(key, value) {
      if (arguments.length === 1) return this.get("settings", key);
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("settings", "readwrite");
        tx.objectStore("settings").put(value, key);
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
      });
    }
    async list() {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const request = db.transaction("documents").objectStore("documents").getAll();
        request.onsuccess = () => resolve(request.result.sort((a, b) => b.data.savedAt.localeCompare(a.data.savedAt)));
        request.onerror = () => reject(request.error);
      });
    }
    async read(id, version) {
      const record = await this.get("documents", id);
      if (!record) return null;
      const data = version == null ? record.data : record.history.find((entry) => entry.seq === version)?.data;
      if (!data) throw new Error("この保存履歴は見つかりません。");
      return { ...record, data: { ...data, assets: await Promise.all((data.assets || []).map(async (asset) => {
        const stored = await this.get("assets", asset.id);
        return { ...asset, file: stored?.bytes ? new root.Blob([stored.bytes], { type: stored.type }) : stored };
      })) } };
    }
    async current() {
      const id = await this.setting("activeDraft");
      if (id) return this.read(id);
      const existing = await this.list();
      if (existing.length) return this.read(existing[0].id);
      const legacy = await this.get("drafts", "current");
      if (!legacy) return null;
      await this.save("legacy-current", legacy, 0);
      return this.read("legacy-current");
    }
    async save(id, data, expected, checkpoint = false) {
      // Binary records avoid WebKit's Blob serialization stalls. Read the bytes
      // before opening the transaction, and cache them while the file is in use.
      const images = await Promise.all((data.assets || []).filter((asset) => asset.file).map(async (asset) => {
        if (!this.imageBytes.has(asset.file)) this.imageBytes.set(asset.file, asset.file.arrayBuffer());
        return { id: asset.id, bytes: await this.imageBytes.get(asset.file), type: asset.file.type };
      }));
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(["documents", "assets", "settings"], "readwrite");
        const documents = tx.objectStore("documents"), blobs = tx.objectStore("assets");
        let result, conflict;
        const request = documents.get(id);
        request.onsuccess = () => {
          const previous = request.result;
          if ((previous?.seq || 0) !== expected) {
            conflict = Object.assign(new Error("別のタブで更新されています。"), { name: "DraftConflictError" });
            tx.abort(); return;
          }
          const snapshot = { ...data, draftId: id, assets: (data.assets || []).map(({ file, ...asset }) => asset) };
          for (const asset of images) {
            const present = blobs.getKey(asset.id);
            present.onsuccess = () => { if (present.result === undefined) blobs.put({ bytes: asset.bytes, type: asset.type }, asset.id); };
          }
          const history = [...(previous?.history || [])];
          const changed = previous && JSON.stringify({ ...previous.data, savedAt: "" }) !== JSON.stringify({ ...snapshot, savedAt: "" });
          const lastCheckpoint = previous?.checkpointAt || 0;
          if (changed && (checkpoint || Date.now() - lastCheckpoint >= 60000)) {
            history.push({ seq: previous.seq, data: previous.data });
          }
          result = { id, seq: expected + 1, data: snapshot, history: history.slice(-10),
            checkpointAt: history.length !== (previous?.history.length || 0) ? Date.now() : lastCheckpoint };
          documents.put(result, id);
          tx.objectStore("settings").put(id, "activeDraft");
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(conflict || tx.error || new Error("下書きを保存できませんでした。"));
      });
    }
  }
  if (typeof module === "object" && module.exports) module.exports = DraftStore;
  else root.BlogDraftStore = DraftStore;
})(typeof window !== "undefined" ? window : globalThis);
