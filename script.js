// Modules de script
const scriptModules = {
  system: (vars) => `
##############################################
echo "=== 🌀 Mise à jour du système ==="
##############################################
apt update && apt upgrade -y
apt install software-properties-common curl unzip git -y
`,
  apache: (vars) => `
##############################################
echo "=== 🌐 Installation Apache2 ==="
##############################################
apt install apache2 -y
a2enmod rewrite headers
systemctl enable apache2
`,
  firewall: (vars) => `
##############################################
echo "=== 🔥 Configuration du Pare-feu (UFW) ==="
##############################################
apt install ufw -y
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
`,
  sftp: (vars) => `
##############################################
echo "=== 🧑 Création de l'utilisateur SFTP + groupe ==="
##############################################
groupadd "${vars.SFTP_GROUP}" || true

if ! id "${vars.SFTP_USER}" &>/dev/null; then
    adduser --gecos "" --no-create-home "${vars.SFTP_USER}"
    echo "${vars.SFTP_USER}:${vars.SFTP_PASS}" | chpasswd
    usermod -aG "${vars.SFTP_GROUP}" "${vars.SFTP_USER}"
fi

##############################################
echo "=== 📁 Création des répertoires web ==="
##############################################
mkdir -p ${vars.PROJECT_ROOT}/public
chown root:root /var/www/${vars.SFTP_USER}
chmod 755 /var/www/${vars.SFTP_USER}
chown -R ${vars.SFTP_USER}:${vars.SFTP_GROUP} /var/www/${vars.SFTP_USER}/www
chown -R ${vars.SFTP_USER}:www-data ${vars.PROJECT_ROOT}

##############################################
echo "=== 🎨 Création de index.php avec style ==="
##############################################
cat > ${vars.PROJECT_ROOT}/public/index.php <<'INDEXPHP'
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>COCO - Ça marche! 🎉</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .container {
            text-align: center;
            background: white;
            padding: 50px 60px;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 {
            font-size: 3em;
            color: #667eea;
            margin: 0 0 20px 0;
        }
        .emoji {
            font-size: 4em;
            margin: 20px 0;
        }
        p {
            font-size: 1.5em;
            color: #333;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="emoji">🥥 ✨ 🚀</div>
        <h1>COCO</h1>
        <p>ça marche ! 🎉</p>
        <div class="emoji">💪 🔥 ✅</div>
    </div>
</body>
</html>
INDEXPHP

chown ${vars.SFTP_USER}:www-data ${vars.PROJECT_ROOT}/public/index.php
chmod 644 ${vars.PROJECT_ROOT}/public/index.php

##############################################
echo "=== 🔑 Activation de l'authentification par mot de passe SSH ==="
##############################################
sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
systemctl restart ssh

##############################################
echo "=== 🔐 Configuration du jail SFTP ==="
##############################################
SSHD_CONFIG="/etc/ssh/sshd_config"

if ! grep -q "Match Group ${vars.SFTP_GROUP}" "$SSHD_CONFIG"; then
cat <<EOF >> $SSHD_CONFIG

Subsystem sftp internal-sftp

Match Group ${vars.SFTP_GROUP}
    ChrootDirectory /var/www/%u
    ForceCommand internal-sftp
    X11Forwarding no
    AllowTcpForwarding no
EOF
systemctl restart ssh
fi

##############################################
echo "=== 🏗 Configuration du VirtualHost Apache ==="
##############################################
cat > /etc/apache2/sites-available/000-default.conf <<EOL
<VirtualHost *:80>
    DocumentRoot ${vars.PROJECT_ROOT}/public

    <Directory ${vars.PROJECT_ROOT}/public>
        Options +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog \${APACHE_LOG_DIR}/project_error.log
    CustomLog \${APACHE_LOG_DIR}/project_access.log combined
</VirtualHost>
EOL

apache2ctl configtest
systemctl reload apache2
`,
  php: (vars) => `
##############################################
echo "=== 🛠 Installation de PHP 8.3 (Ubuntu Noble Officiel) ==="
##############################################
apt install -y php8.3 php8.3-cli php8.3-fpm \\
php8.3-common php8.3-mbstring php8.3-xml \\
php8.3-intl php8.3-curl php8.3-zip php8.3-gd \\
php8.3-bcmath php8.3-mysql php8.3-opcache \\
libapache2-mod-php8.3

systemctl restart apache2
`,
  composer: (vars) => `
##############################################
echo "=== 📦 Installation de Composer ==="
##############################################
curl -sS https://getcomposer.org/installer | php
mv composer.phar /usr/local/bin/composer
chmod +x /usr/local/bin/composer
`,
  mariadb: (vars) => `
##############################################
echo "=== 💾 Installation de MariaDB ==="
##############################################
apt install mariadb-server mariadb-client -y

##############################################
echo "=== 🛡 Sécurisation de MariaDB ==="
##############################################
mysql -e "DELETE FROM mysql.user WHERE User='';"
mysql -e "DROP DATABASE IF EXISTS test;"
mysql -e "FLUSH PRIVILEGES;"

##############################################
echo "=== 🎲 Création de la base de données + utilisateur ==="
##############################################
mysql -e "CREATE DATABASE IF NOT EXISTS ${vars.MYSQL_DB};"
mysql -e "CREATE USER IF NOT EXISTS '${vars.MYSQL_USER}'@'localhost' IDENTIFIED BY '${vars.MYSQL_PASS}';"
mysql -e "GRANT ALL PRIVILEGES ON ${vars.MYSQL_DB}.* TO '${vars.MYSQL_USER}'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"
`,
  phpmyadmin: (vars) => `
##############################################
echo "=== 🧰 Installation de phpMyAdmin ==="
##############################################
DEBIAN_FRONTEND=noninteractive apt install phpmyadmin -y
ln -sf /etc/phpmyadmin/apache.conf /etc/apache2/conf-available/phpmyadmin.conf
a2enconf phpmyadmin
systemctl reload apache2
`,
};

// Noms des modules pour l'affichage
const moduleNames = {
  system: { name: "Mise à jour système", icon: "🔄" },
  apache: { name: "Apache2", icon: "🌐" },
  firewall: { name: "Pare-feu (UFW)", icon: "🔥" },
  sftp: { name: "SFTP", icon: "🔐" },
  php: { name: "PHP 8.3", icon: "🐘" },
  composer: { name: "Composer", icon: "📦" },
  mariadb: { name: "MariaDB", icon: "💾" },
  phpmyadmin: { name: "phpMyAdmin", icon: "🧰" },
};

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
  if (modules.apache) rules.push("sftpSite", "sftpUser");
  if (modules.mariadb || modules.phpmyadmin)
    rules.push("mysqlUser", "mysqlPass", "mysqlDb");

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

// Fonction pour générer le script (option: forcer tous les modules)
function generateScript(options = {}) {
  const vars = getVariables();

  // En-tête du script
  let script = `#!/bin/bash
set -e

##############################################
# 🔧 VARIABLES DE CONFIGURATION
##############################################
SFTP_USER="${vars.SFTP_USER}"
SFTP_PASS="${vars.SFTP_PASS}"
SFTP_GROUP="${vars.SFTP_GROUP}"
SFTP_SITE="${vars.SFTP_SITE}"
MYSQL_USER="${vars.MYSQL_USER}"
MYSQL_PASS="${vars.MYSQL_PASS}"
MYSQL_DB="${vars.MYSQL_DB}"
PROJECT_ROOT="${vars.PROJECT_ROOT}"
`;

  // Vérifier quels modules sont sélectionnés (ou forcer tous)
  const modules = options.forceAllModules
    ? Object.keys(scriptModules).reduce((acc, k) => ((acc[k] = true), acc), {})
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

  // Pied de page
  script += `
##############################################
echo "=== 🎉 INSTALLATION TERMINÉE ! ==="
##############################################
echo "🌍 Site Web: http://<IP-DU-SERVEUR>/"`;

  if (modules.phpmyadmin) {
    script += `
echo "🛢 phpMyAdmin: http://<IP-DU-SERVEUR>/phpmyadmin/"`;
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
  // Script complet = tous les modules => toutes les variables doivent être remplies
  const all = getAllModules();
  if (!validateBeforeGenerate(all)) return;

  const script = generateScript({ forceAllModules: true });
  showScriptInModal(script, true);
}

function previewModules() {
  const selected = getSelectedModules();
  if (!validateBeforeGenerate(selected)) return;

  const script = generateScript({ forceAllModules: false });
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
document.addEventListener("DOMContentLoaded", () => {
  on($id("generateBtn"), "click", displayScript);
  on($id("selectAllBtn"), "click", selectAll);
  on($id("deselectAllBtn"), "click", deselectAll);

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
