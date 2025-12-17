// Modules de script (NOW loaded from modules.json)
let scriptModules = {};
let moduleNames = {};
let modulesLoaded = false;

function renderTemplate(template, vars) {
  return String(template).replace(/{{\s*([A-Z0-9_]+)\s*}}/g, (_, key) => {
    return vars[key] ?? "";
  });
}

async function loadModulesConfig() {
  try {
    const res = await fetch("modules.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const mods = data?.modules || {};
    moduleNames = {};
    scriptModules = {};

    for (const [key, mod] of Object.entries(mods)) {
      moduleNames[key] = { name: mod.name, icon: mod.icon };
      scriptModules[key] = (vars) => renderTemplate(mod.script || "", vars);
    }

    modulesLoaded = true;
  } catch (e) {
    modulesLoaded = false;
    showValidationError(
      "Impossible de charger modules.json. Lance la page via un serveur HTTP (pas file://).",
      []
    );
  }
}

function ensureModulesLoaded() {
  if (modulesLoaded) return true;
  showValidationError(
    "Modules non chargés (modules.json). Impossible de générer le script.",
    []
  );
  return false;
}

// Helpers DOM (évite les crashs si un élément n'existe pas)
const $id = (id) => document.getElementById(id);
const on = (el, evt, handler) => {
  if (el) el.addEventListener(evt, handler);
};

// (FIX) Modules sélectionnés (manquait => ReferenceError)
function getSelectedModules() {
  return {
    system: !!$id("moduleSystem")?.checked,
    apache: !!$id("moduleApache")?.checked,
    firewall: !!$id("moduleFirewall")?.checked,
    sftp: !!$id("moduleSftp")?.checked,
    php: !!$id("modulePhp")?.checked,
    composer: !!$id("moduleComposer")?.checked,
    mariadb: !!$id("moduleMariadb")?.checked,
    phpmyadmin: !!$id("modulePhpmyadmin")?.checked,
  };
}

// (FIX) selectAll/deselectAll (manquait => ReferenceError)
function setAllModules(checked) {
  const ids = [
    "moduleSystem",
    "moduleApache",
    "moduleFirewall",
    "moduleSftp",
    "modulePhp",
    "moduleComposer",
    "moduleMariadb",
    "modulePhpmyadmin",
  ];
  for (const id of ids) {
    const el = $id(id);
    if (el) el.checked = checked;
  }
}
function selectAll() {
  setAllModules(true);
}
function deselectAll() {
  setAllModules(false);
}

// NEW: Reset form (inputs + modules + UI)
function resetForm() {
  // close modal if open + clear errors
  closeModal();
  clearValidationUI();

  const fields = [
    "sftpSite",
    "serverIp",
    "sftpUser",
    "sftpPass",
    "sftpGroup",
    "mysqlUser",
    "mysqlPass",
    "mysqlDb",
  ];

  for (const id of fields) {
    const el = $id(id);
    if (!el) continue;
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // reset password visibility to hidden + reset buttons state
  for (const id of ["sftpPass", "mysqlPass"]) {
    const el = $id(id);
    if (el) el.type = "password";
  }
  document.querySelectorAll(".toggle-password").forEach((btn) => {
    btn.textContent = "👁️";
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Afficher le mot de passe");
  });

  // default: all modules checked
  setAllModules(true);
}

// (FIX) closeModal was missing => ReferenceError in DOMContentLoaded handlers
function closeModal() {
  $id("moduleModal")?.classList.remove("show");
}

function getValue(id) {
  return ($id(id)?.value ?? "").trim();
}

function clearValidationUI() {
  const err = $id("formError");
  if (err) {
    err.textContent = "";
    err.classList.remove("show");
  }
  const ids = [
    "sftpSite",
    "sftpUser",
    "sftpPass",
    "sftpGroup",
    "mysqlUser",
    "mysqlPass",
    "mysqlDb",
  ];
  for (const id of ids) $id(id)?.classList.remove("input-invalid");
}

function showValidationError(message, invalidIds = []) {
  const err = $id("formError");
  if (err) {
    err.textContent = message;
    err.classList.add("show");
  }
  for (const id of invalidIds) $id(id)?.classList.add("input-invalid");
}

function validateBeforeGenerate(modules) {
  clearValidationUI();

  const rules = [];
  if (modules.sftp) rules.push("sftpSite", "sftpUser", "sftpPass", "sftpGroup");

  // CHANGE: Apache should not require project/site or SFTP user anymore
  // if (modules.apache) rules.push("sftpSite", "sftpUser");

  // CHANGE: phpMyAdmin should not require MySQL credentials anymore
  if (modules.mariadb) rules.push("mysqlUser", "mysqlPass", "mysqlDb");

  const required = [...new Set(rules)];

  const missing = required.filter((id) => !getValue(id));
  if (missing.length > 0) {
    const labels = {
      sftpSite: "Nom du site / Projet",
      sftpUser: "Utilisateur SFTP",
      sftpPass: "Mot de passe SFTP",
      sftpGroup: "Groupe SFTP",
      mysqlUser: "Utilisateur MySQL",
      mysqlPass: "Mot de passe MySQL",
      mysqlDb: "Nom de la base de données",
    };
    const human = missing.map((id) => labels[id] || id).join(", ");
    showValidationError(`Veuillez remplir: ${human}`, missing);
    return false;
  }

  // (NEW) Minimum 8 chars for SFTP credentials when SFTP module is selected
  if (modules.sftp) {
    const minLenById = { sftpUser: 8, sftpPass: 8, sftpGroup: 8 };
    const labels = {
      sftpUser: "Utilisateur SFTP",
      sftpPass: "Mot de passe SFTP",
      sftpGroup: "Groupe SFTP",
    };

    const tooShort = Object.keys(minLenById).filter(
      (id) => getValue(id).length > 0 && getValue(id).length < minLenById[id]
    );

    if (tooShort.length > 0) {
      const human = tooShort
        .map((id) => `${labels[id] || id} (min. ${minLenById[id]} caractères)`)
        .join(", ");
      showValidationError(`Champs trop courts: ${human}`, tooShort);
      return false;
    }
  }

  return true;
}

// Fonction pour collecter les valeurs des variables
function getVariables() {
  const sftpUser = getValue("sftpUser");
  const sftpSite = getValue("sftpSite");

  return {
    SERVER_IP: getValue("serverIp"),
    SFTP_USER: sftpUser,
    SFTP_PASS: getValue("sftpPass"),
    SFTP_GROUP: getValue("sftpGroup"),
    SFTP_SITE: sftpSite,
    MYSQL_USER: getValue("mysqlUser"),
    MYSQL_PASS: getValue("mysqlPass"),
    MYSQL_DB: getValue("mysqlDb"),
    PROJECT_ROOT:
      sftpUser && sftpSite ? `/var/www/${sftpUser}/www/${sftpSite}` : "",
  };
}

function bashDoubleQuoteEscape(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
}

function buildConfigBlock(vars) {
  const orderedKeys = [
    "SERVER_IP",
    "SFTP_USER",
    "SFTP_PASS",
    "SFTP_GROUP",
    "SFTP_SITE",
    "MYSQL_USER",
    "MYSQL_PASS",
    "MYSQL_DB",
    "PROJECT_ROOT",
  ];

  const lines = [];
  for (const key of orderedKeys) {
    const raw = (vars[key] ?? "").toString().trim();
    if (!raw) continue;
    lines.push(`${key}="${bashDoubleQuoteEscape(raw)}"`);
  }

  if (lines.length === 0) return "";

  return `
##############################################
# 🔧 VARIABLES DE CONFIGURATION
##############################################
${lines.join("\n")}
`;
}

// Fonction pour générer le script (option: forcer tous les modules)
function generateScript(options = {}) {
  if (!ensureModulesLoaded()) return "";

  const vars = getVariables();

  // NEW: compute final host for URLs (embed directly in generated script)
  const serverIp = (vars.SERVER_IP || "").trim();
  const urlHost = serverIp ? serverIp.replace(/["`$\\]/g, "") : "<IP-DU-SERVEUR>";

  // En-tête du script (CHANGED: only include config block if something is filled)
  let script = `#!/bin/bash
set -e
`;

  script += buildConfigBlock(vars);

  // Vérifier quels modules sont sélectionnés (ou forcer tous)
  const modules = options.forceAllModules
    ? getAllModules()
    : getSelectedModules();

  // Ajouter les modules sélectionnés
  for (const [key, isSelected] of Object.entries(modules)) {
    if (isSelected && scriptModules[key]) {
      script += scriptModules[key](vars);
    }
  }

  // Redémarrage Apache si nécessaire
  if (modules.apache || modules.php || modules.phpmyadmin) {
    script += `
##############################################
echo "=== 🔁 Redémarrage d'Apache ==="
##############################################
systemctl restart apache2
`;
  }

  // Pied de page (CHANGED: embed urlHost instead of ${SERVER_IP:-...})
  script += `
##############################################
echo "=== 🎉 INSTALLATION TERMINÉE ! ==="
##############################################
echo "🌍 Site Web: http://${urlHost}/"`;

  if (modules.phpmyadmin) {
    script += `
echo "🛢 phpMyAdmin: http://${urlHost}/phpmyadmin/"`;
  }

  if (modules.sftp) {
    script += `
echo "📁 Dossier SFTP: ${vars.PROJECT_ROOT}"
echo "👤 Utilisateur SFTP: ${vars.SFTP_USER}"`;
  }

  script += "\n";

  return script;
}

// Afficher le résultat
function displayScript() {
  if (!ensureModulesLoaded()) return;

  const all = getAllModules();
  if (!validateBeforeGenerate(all)) return;

  const script = generateScript({ forceAllModules: true });
  if (!script) return;
  showScriptInModal(script, true);
}

function previewModules() {
  if (!ensureModulesLoaded()) return;

  const selected = getSelectedModules();
  if (!validateBeforeGenerate(selected)) return;

  const script = generateScript({ forceAllModules: false });
  if (!script) return;
  showScriptInModal(script, false);
}

// Nouvelle fonction pour afficher le script dans le modal
function showScriptInModal(script, isFullScript = false) {
  const modules = getSelectedModules();
  const modulesList = document.getElementById("selectedModulesList");
  modulesList.innerHTML = "";

  if (isFullScript) {
    // Afficher un badge pour indiquer que c'est le script complet
    const badge = document.createElement("div");
    badge.className = "module-badge";
    badge.style.background =
      "linear-gradient(135deg, #28a745 0%, #20c997 100%)";
    badge.innerHTML = `
            <span class="module-badge-icon">⚡</span>
            <span>Script Complet - Tous les modules</span>
        `;
    modulesList.appendChild(badge);
  } else {
    // Afficher les badges des modules sélectionnés
    let hasSelection = false;
    for (const [key, isSelected] of Object.entries(modules)) {
      if (isSelected) {
        hasSelection = true;
        const badge = document.createElement("div");
        badge.className = "module-badge";
        badge.innerHTML = `
                    <span class="module-badge-icon">${moduleNames[key].icon}</span>
                    <span>${moduleNames[key].name}</span>
                `;
        modulesList.appendChild(badge);
      }
    }

    if (!hasSelection) {
      modulesList.innerHTML =
        '<p style="color: #ff6b6b; font-weight: 600;">❌ Aucun module sélectionné</p>';
    }
  }

  document.getElementById("moduleScriptPreview").textContent = script;
  document.getElementById("moduleModal").classList.add("show");
}

// Copier le script
async function copyScript() {
  const scriptPreview = $id("moduleScriptPreview");
  if (!scriptPreview) return;

  const text = scriptPreview.textContent || "";

  // Clipboard API (secure contexts), fallback execCommand
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
  } catch {
    // fallback best-effort
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
  }

  const btn = $id("copyModuleScriptBtn");
  if (!btn) return;

  const originalText = btn.textContent;
  btn.textContent = "✅ Copié !";
  setTimeout(() => {
    btn.textContent = originalText;
  }, 2000);
}

// Alias pour compatibilité avec le binding existant
function copyModuleScript() {
  return copyScript();
}

// Télécharger le script
function downloadScript() {
  const script = generateScript();
  const blob = new Blob([script], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "install.sh";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Télécharger le script du modal
function downloadModuleScript() {
  const scriptPreview = document.getElementById("moduleScriptPreview");
  const script = scriptPreview.textContent;
  const blob = new Blob([script], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "install.sh";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Événements
document.addEventListener("DOMContentLoaded", async () => {
  await loadModulesConfig();

  on($id("generateBtn"), "click", displayScript);
  on($id("selectAllBtn"), "click", selectAll);
  on($id("deselectAllBtn"), "click", deselectAll);
  on($id("resetFormBtn"), "click", resetForm);

  // Modal
  on($id("previewModulesBtn"), "click", previewModules);
  on($id("closeModalBtn"), "click", closeModal);
  on($id("copyModuleScriptBtn"), "click", copyScript); // bind direct (évite undefined)
  on($id("downloadModuleScriptBtn"), "click", downloadModuleScript);
  on(document.querySelector(".close-modal"), "click", closeModal);

  on($id("moduleModal"), "click", (e) => {
    if (e.target && e.target.id === "moduleModal") closeModal();
  });

  // Nettoyer l'erreur dès que l'utilisateur tape
  const watched = [
    "sftpSite",
    "sftpUser",
    "sftpPass",
    "sftpGroup",
    "mysqlUser",
    "mysqlPass",
    "mysqlDb",
    "serverIp", // NEW (optional, but clears any displayed error state consistently)
  ];
  for (const id of watched) on($id(id), "input", clearValidationUI);

  // Counters (SFTP only)
  setupCharCounter("sftpUser", "sftpUserCounter", 8);
  setupCharCounter("sftpPass", "sftpPassCounter", 8);
  setupCharCounter("sftpGroup", "sftpGroupCounter", 8);

  // Eye toggles (all password inputs)
  setupPasswordToggles();
});

// NEW: "Script complet" => tous les modules activés
function getAllModules() {
  return Object.keys(scriptModules).reduce((acc, k) => ((acc[k] = true), acc), {});
}

function setupCharCounter(inputId, counterId, minLen = 0) {
  const input = $id(inputId);
  const counter = $id(counterId);
  if (!input || !counter) return;

  const update = () => {
    const len = (input.value || "").length;
    counter.textContent = String(len);
    counter.classList.toggle("ok", minLen > 0 ? len >= minLen : len > 0);
  };

  on(input, "input", update);
  update();
}

function setupPasswordToggles() {
  document.querySelectorAll(".toggle-password").forEach((btn) => {
    on(btn, "click", () => {
      const targetId = btn.getAttribute("data-target");
      const input = targetId ? $id(targetId) : null;
      if (!input) return;

      const isHidden = input.type === "password";
      input.type = isHidden ? "text" : "password";

      btn.textContent = isHidden ? "🙈" : "👁️";
      btn.setAttribute("aria-pressed", isHidden ? "true" : "false");
      btn.setAttribute("aria-label", isHidden ? "Masquer le mot de passe" : "Afficher le mot de passe");
    });
  });
}
