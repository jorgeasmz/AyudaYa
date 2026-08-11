import { useCallback, useEffect, useState } from 'react';
import Mensaje from '../../componentes/Mensaje.jsx';
import { EsqueletoLista } from '../../componentes/Esqueleto.jsx';
import FilaModeracion from './FilaModeracion.jsx';
import {
  cerrarSesionAdmin,
  iniciarSesionAdmin,
  listarPersonasModeracion,
  listarReportesModeracion,
  sesionActual,
  verificarEsAdmin,
} from '../../lib/api.js';
import { interpretarError } from '../../lib/supabase.js';

/**
 * Panel de moderación.
 *
 * Sobre la autenticación: aquí NO hay contraseña en una variable de entorno.
 * Cualquier variable `VITE_*` acaba escrita en texto plano dentro del
 * JavaScript que descarga el navegador, así que sería una contraseña pública.
 * En su lugar se usa un único usuario de Supabase Auth, y la RLS comprueba
 * además que ese usuario esté en `privado.administradores`. El resultado es el
 * mismo para quien modera -un correo y una contraseña compartidos- pero el
 * secreto nunca sale del servidor.
 */
export default function VistaAdmin({ alSalir }) {
  const [sesion, establecerSesion] = useState(null);
  const [esAdmin, establecerEsAdmin] = useState(false);
  const [comprobando, establecerComprobando] = useState(true);

  useEffect(() => {
    let vigente = true;

    (async () => {
      try {
        const s = await sesionActual();
        if (!vigente) return;
        establecerSesion(s);
        if (s) establecerEsAdmin(await verificarEsAdmin());
      } catch {
        if (vigente) establecerSesion(null);
      } finally {
        if (vigente) establecerComprobando(false);
      }
    })();

    return () => {
      vigente = false;
    };
  }, []);

  if (comprobando) {
    return (
      <div className="admin">
        <EsqueletoLista filas={2} />
      </div>
    );
  }

  if (!sesion || !esAdmin) {
    return (
      <Acceso
        haySesionSinPermiso={Boolean(sesion) && !esAdmin}
        alEntrar={(s, admin) => {
          establecerSesion(s);
          establecerEsAdmin(admin);
        }}
        alSalir={alSalir}
      />
    );
  }

  return (
    <Tablero
      alCerrarSesion={async () => {
        await cerrarSesionAdmin();
        establecerSesion(null);
        establecerEsAdmin(false);
      }}
      alSalir={alSalir}
    />
  );
}

// ---------------------------------------------------------------------------
//  Acceso
// ---------------------------------------------------------------------------

function Acceso({ haySesionSinPermiso, alEntrar, alSalir }) {
  const [correo, establecerCorreo] = useState('');
  const [contrasena, establecerContrasena] = useState('');
  const [entrando, establecerEntrando] = useState(false);
  const [error, establecerError] = useState(null);

  async function alEnviar(evento) {
    evento.preventDefault();
    establecerEntrando(true);
    establecerError(null);

    try {
      const s = await iniciarSesionAdmin(correo.trim(), contrasena);
      const admin = await verificarEsAdmin();
      if (!admin) {
        await cerrarSesionAdmin();
        throw new Error(
          'Esa cuenta existe pero no está autorizada para moderar. ' +
            'Añádela a privado.administradores (paso 5 del README).'
        );
      }
      alEntrar(s, admin);
    } catch (bruto) {
      establecerError(interpretarError(bruto));
    } finally {
      establecerEntrando(false);
    }
  }

  return (
    <div className="admin admin-acceso">
      <h1>Panel de moderación</h1>

      {haySesionSinPermiso && (
        <Mensaje tipo="error">Tu sesión no tiene permiso de moderación.</Mensaje>
      )}

      <form className="formulario" onSubmit={alEnviar}>
        {error && <Mensaje tipo="error">{error.message}</Mensaje>}

        <div className="campo">
          <label className="etiqueta" htmlFor="correo">
            Correo
          </label>
          <input
            id="correo"
            className="entrada"
            type="email"
            value={correo}
            onChange={(e) => establecerCorreo(e.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div className="campo">
          <label className="etiqueta" htmlFor="contrasena">
            Contraseña
          </label>
          <input
            id="contrasena"
            className="entrada"
            type="password"
            value={contrasena}
            onChange={(e) => establecerContrasena(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button
          type="submit"
          className="boton boton-primario boton-grande"
          disabled={entrando || !correo || !contrasena}
        >
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <button type="button" className="boton boton-plano" onClick={alSalir}>
        ← Volver al mapa
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Tablero
// ---------------------------------------------------------------------------

function Tablero({ alCerrarSesion, alSalir }) {
  const [pestana, establecerPestana] = useState('reporte_mapa');
  const [elementos, establecerElementos] = useState([]);
  const [cargando, establecerCargando] = useState(true);
  const [error, establecerError] = useState(null);
  const [soloDenunciados, establecerSoloDenunciados] = useState(false);

  const cargar = useCallback(async () => {
    establecerCargando(true);
    establecerError(null);
    try {
      const datos =
        pestana === 'reporte_mapa'
          ? await listarReportesModeracion()
          : await listarPersonasModeracion();
      establecerElementos(datos);
    } catch (bruto) {
      establecerError(interpretarError(bruto));
    } finally {
      establecerCargando(false);
    }
  }, [pestana]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const alCambiarElemento = useCallback((id, cambios) => {
    establecerElementos((previos) => {
      if (cambios === null) return previos.filter((e) => e.id !== id);
      return previos.map((e) => (e.id === id ? { ...e, ...cambios } : e));
    });
  }, []);

  const visibles = soloDenunciados
    ? elementos.filter((e) => (e.reportes_abuso || 0) > 0)
    : elementos;

  const pendientes = elementos.filter((e) => (e.reportes_abuso || 0) > 0).length;
  const ocultos = elementos.filter((e) => (e.reportes_abuso || 0) > 5).length;

  return (
    <div className="admin">
      <header className="admin-cabecera">
        <h1>Moderación</h1>
        <div className="admin-cabecera-acciones">
          <button type="button" className="boton boton-plano" onClick={alSalir}>
            Ver la app
          </button>
          <button type="button" className="boton boton-plano" onClick={alCerrarSesion}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <div className="admin-resumen">
        <span>
          <strong>{elementos.length}</strong> registros
        </span>
        <span>
          <strong>{pendientes}</strong> con denuncias
        </span>
        <span className={ocultos ? 'es-alerta' : ''}>
          <strong>{ocultos}</strong> ocultos al público
        </span>
      </div>

      <div className="admin-pestanas" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={pestana === 'reporte_mapa'}
          className={`admin-pestana ${pestana === 'reporte_mapa' ? 'es-activa' : ''}`}
          onClick={() => establecerPestana('reporte_mapa')}
        >
          Reportes del mapa
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pestana === 'persona'}
          className={`admin-pestana ${pestana === 'persona' ? 'es-activa' : ''}`}
          onClick={() => establecerPestana('persona')}
        >
          Personas
        </button>
      </div>

      <div className="admin-controles">
        <label className="casilla">
          <input
            type="checkbox"
            checked={soloDenunciados}
            onChange={(e) => establecerSoloDenunciados(e.target.checked)}
          />
          <span>Solo con denuncias</span>
        </label>
        <button
          type="button"
          className="boton boton-secundario"
          onClick={cargar}
          disabled={cargando}
        >
          {cargando ? 'Cargando…' : '↻ Recargar'}
        </button>
      </div>

      {error && <Mensaje tipo="error">{error.message}</Mensaje>}

      {cargando && !visibles.length && <EsqueletoLista filas={4} />}

      {!cargando && !visibles.length && (
        <div className="lista-vacia">
          <p>No hay nada que revisar aquí.</p>
        </div>
      )}

      <div className="admin-lista">
        {visibles.map((elemento) => (
          <FilaModeracion
            key={elemento.id}
            recurso={pestana}
            elemento={elemento}
            alCambiar={alCambiarElemento}
          />
        ))}
      </div>
    </div>
  );
}
