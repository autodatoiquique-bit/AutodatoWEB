/**
 * Panel admin: Configuración (clave y futuras opciones).
 */
"use strict";

function renderConfiguracionAdmin() {
  editando = null;
  $("stage")?.classList.remove("stage-board");
  const nube = typeof nubeActiva === "function" && nubeActiva();
  $("stage").innerHTML = `
    <div class="admin-panel admin-panel-config">
      <h2>Configuración</h2>
      <p class="muted">Ajustes del panel interno. La clave no se guarda en el navegador como texto plano.</p>
      <nav class="admin-config-menu" aria-label="Opciones de configuración">
        <button type="button" class="admin-config-item is-on" data-admin-config-seccion="clave">Cambiar clave</button>
      </nav>
      <div id="admin-config-cuerpo">${htmlCambiarClaveAdmin(nube)}</div>
    </div>`;
}

function htmlCambiarClaveAdmin(nube) {
  if (nube) {
    return `
      <section class="admin-config-seccion">
        <h3>Cambiar clave de acceso</h3>
        <p class="muted admin-config-ayuda">
          Usa una clave que puedas recordar (frase corta). Mínimo 8 caracteres. Se valida con Supabase; nadie en AutoDato la ve en texto claro.
        </p>
        <div class="admin-config-form">
          <label class="field"><span>Clave actual</span><input id="cfg-clave-actual" type="password" autocomplete="current-password" /></label>
          <label class="field"><span>Clave nueva</span><input id="cfg-clave-nueva" type="password" autocomplete="new-password" /></label>
          <label class="field"><span>Repite la clave nueva</span><input id="cfg-clave-nueva2" type="password" autocomplete="new-password" /></label>
        </div>
        <p id="cfg-clave-error" class="error" hidden></p>
        <p id="cfg-clave-ok" class="muted admin-config-ok" hidden></p>
        <button type="button" class="btn-primary" id="btn-cfg-guardar-clave">Guardar clave nueva</button>
      </section>`;
  }
  return `
    <section class="admin-config-seccion">
      <h3>Cambiar clave de acceso (este navegador)</h3>
      <p class="muted admin-config-ayuda">
        Modo sin Supabase: la clave solo vive cifrada en este equipo. Mínimo 4 caracteres.
      </p>
      <div class="admin-config-form">
        <label class="field"><span>Clave actual</span><input id="cfg-clave-actual" type="password" autocomplete="current-password" /></label>
        <label class="field"><span>Clave nueva</span><input id="cfg-clave-nueva" type="password" autocomplete="new-password" /></label>
        <label class="field"><span>Repite la clave nueva</span><input id="cfg-clave-nueva2" type="password" autocomplete="new-password" /></label>
      </div>
      <p id="cfg-clave-error" class="error" hidden></p>
      <p id="cfg-clave-ok" class="muted admin-config-ok" hidden></p>
      <button type="button" class="btn-primary" id="btn-cfg-guardar-clave">Guardar clave nueva</button>
    </section>`;
}

async function guardarClaveConfigAdmin() {
  const err = $("cfg-clave-error");
  const ok = $("cfg-clave-ok");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  if (ok) ok.hidden = true;
  const actual = $("cfg-clave-actual") ? $("cfg-clave-actual").value : "";
  const nueva = $("cfg-clave-nueva") ? $("cfg-clave-nueva").value : "";
  const nueva2 = $("cfg-clave-nueva2") ? $("cfg-clave-nueva2").value : "";
  const nube = typeof nubeActiva === "function" && nubeActiva();
  const minLen = nube ? 8 : 4;
  if (!actual || !nueva) {
    if (err) {
      err.textContent = "Completa la clave actual y la nueva.";
      err.hidden = false;
    }
    return;
  }
  if (nueva.length < minLen) {
    if (err) {
      err.textContent = `La clave nueva debe tener al menos ${minLen} caracteres.`;
      err.hidden = false;
    }
    return;
  }
  if (nueva !== nueva2) {
    if (err) {
      err.textContent = "Las dos claves nuevas no coinciden.";
      err.hidden = false;
    }
    return;
  }
  if (nueva === actual) {
    if (err) {
      err.textContent = "La clave nueva debe ser distinta a la actual.";
      err.hidden = false;
    }
    return;
  }
  try {
    if (typeof adminIniciarGuardado === "function") adminIniciarGuardado("Actualizando clave…");
    if (nube) {
      if (typeof nubeCambiarClaveUsuario !== "function") throw new Error("Cambio de clave no disponible.");
      await nubeCambiarClaveUsuario(actual, nueva);
    } else {
      if (typeof hashPin !== "function") throw new Error("No se pudo validar la clave.");
      const okActual = (await hashPin(actual)) === localStorage.getItem("autodato_admin_pin");
      if (!okActual) throw new Error("La clave actual no es correcta.");
      localStorage.setItem("autodato_admin_pin", await hashPin(nueva));
    }
    if ($("cfg-clave-actual")) $("cfg-clave-actual").value = "";
    if ($("cfg-clave-nueva")) $("cfg-clave-nueva").value = "";
    if ($("cfg-clave-nueva2")) $("cfg-clave-nueva2").value = "";
    if (ok) {
      ok.textContent = "Clave actualizada. La próxima vez entra con la clave nueva.";
      ok.hidden = false;
    }
  } catch (e) {
    if (err) {
      err.textContent = String((e && e.message) || e || "No se pudo cambiar la clave.");
      err.hidden = false;
    }
  } finally {
    if (typeof adminFinGuardado === "function") adminFinGuardado();
  }
}

$("btn-configuracion")?.addEventListener("click", () => {
  renderConfiguracionAdmin();
});

document.addEventListener("click", (e) => {
  if (e.target.id === "btn-cfg-guardar-clave" || e.target.closest("#btn-cfg-guardar-clave")) {
    void guardarClaveConfigAdmin();
  }
});
