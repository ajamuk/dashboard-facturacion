# Dashboard Facturacion

Web privada para visualizar el cuadro de mandos integral desde la hoja original de Google Sheets.

## Enfoque

- La hoja original es la fuente unica.
- La aplicacion solo lee datos, no escribe en la hoja.
- Todos los datos quedan protegidos por login.
- La actualizacion es manual mediante el boton "Actualizar datos".
- El backend normaliza las hojas originales para que el dashboard no dependa del formato visual.

## Desarrollo local

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp .env.example .env
./.venv/bin/python app.py
```

Abre:

```text
http://127.0.0.1:5050
```

## Google Sheets

Para produccion se recomienda una cuenta de servicio:

1. Crear una Service Account en Google Cloud.
2. Descargar el JSON de credenciales.
3. Compartir la Google Sheet original con el email de la Service Account como lector.
4. Configurar `GOOGLE_SHEET_ID` y `GOOGLE_SERVICE_ACCOUNT_FILE`.

## Despliegue previsto

Ubuntu + systemd + Gunicorn + Nginx + HTTPS con Let's Encrypt.
