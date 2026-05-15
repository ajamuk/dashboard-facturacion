# Despliegue en Ubuntu + Nginx

Guia para subir `dashboard-facturacion` a un VPS Ubuntu con Nginx, Gunicorn y HTTPS.

## 1. Preparar el servidor

Conectate por SSH:

```bash
ssh usuario@IP_DEL_VPS
```

Instala paquetes base:

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx git certbot python3-certbot-nginx
```

## 2. Crear carpeta de la app

```bash
sudo mkdir -p /opt/dashboard-facturacion
sudo chown -R $USER:$USER /opt/dashboard-facturacion
```

Sube el proyecto desde tu Mac:

```bash
rsync -av \
  --exclude ".venv" \
  --exclude "instance/dashboard.db" \
  --exclude "__pycache__" \
  "/Users/carlos/Documents/New project/dashboard-facturacion/" \
  usuario@IP_DEL_VPS:/opt/dashboard-facturacion/
```

Sube tambien el JSON de Google, preferiblemente a:

```text
/opt/dashboard-facturacion/instance/google-service-account.json
```

Y protege permisos:

```bash
chmod 600 /opt/dashboard-facturacion/instance/google-service-account.json
```

## 3. Instalar dependencias

En el VPS:

```bash
cd /opt/dashboard-facturacion
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

## 4. Configurar `.env`

Crea `/opt/dashboard-facturacion/.env`:

```bash
nano /opt/dashboard-facturacion/.env
```

Contenido recomendado:

```env
SECRET_KEY=CAMBIA_ESTO_POR_UNA_CLAVE_MUY_LARGA
DATABASE_PATH=instance/dashboard.db
ADMIN_USER=admin
ADMIN_PASSWORD=CAMBIA_ESTA_PASSWORD

GOOGLE_SHEET_ID=1FnRLNy8LMj1kwkH7N3v0vEC-Cp0dI4n9JT1b0mdByj4
GOOGLE_SERVICE_ACCOUNT_FILE=/opt/dashboard-facturacion/instance/google-service-account.json
```

Comprueba que lee datos:

```bash
cd /opt/dashboard-facturacion
./.venv/bin/python - <<'PY'
from app import app
from dashboard_data import load_dashboard_payload
with app.app_context():
    payload = load_dashboard_payload()
print(payload["summary"]["latest"])
print(len(payload["metrics"]), len(payload["services"]), len(payload["tariffs"]))
PY
```

## 5. Crear servicio systemd

```bash
sudo nano /etc/systemd/system/dashboard-facturacion.service
```

Contenido:

```ini
[Unit]
Description=Dashboard Facturacion
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/dashboard-facturacion
EnvironmentFile=/opt/dashboard-facturacion/.env
ExecStart=/opt/dashboard-facturacion/.venv/bin/gunicorn --workers 2 --threads 4 --bind 127.0.0.1:8050 app:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Ajusta permisos:

```bash
sudo chown -R www-data:www-data /opt/dashboard-facturacion
sudo chmod 600 /opt/dashboard-facturacion/.env
sudo chmod 600 /opt/dashboard-facturacion/instance/google-service-account.json
```

Activa el servicio:

```bash
sudo systemctl daemon-reload
sudo systemctl enable dashboard-facturacion
sudo systemctl start dashboard-facturacion
sudo systemctl status dashboard-facturacion
```

## 6. Configurar Nginx

```bash
sudo nano /etc/nginx/sites-available/dashboard-facturacion
```

Para dominio:

```nginx
server {
    listen 80;
    server_name TU_DOMINIO.com;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:8050;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Activa la configuracion:

```bash
sudo ln -s /etc/nginx/sites-available/dashboard-facturacion /etc/nginx/sites-enabled/dashboard-facturacion
sudo nginx -t
sudo systemctl reload nginx
```

## 7. Activar HTTPS

Si ya tienes el dominio apuntando al VPS:

```bash
sudo certbot --nginx -d TU_DOMINIO.com
```

## 8. Comandos utiles

Ver logs:

```bash
sudo journalctl -u dashboard-facturacion -f
```

Reiniciar app:

```bash
sudo systemctl restart dashboard-facturacion
```

Actualizar codigo desde tu Mac:

```bash
rsync -av \
  --exclude ".venv" \
  --exclude "instance/dashboard.db" \
  --exclude "__pycache__" \
  "/Users/carlos/Documents/New project/dashboard-facturacion/" \
  usuario@IP_DEL_VPS:/opt/dashboard-facturacion/

ssh usuario@IP_DEL_VPS "sudo chown -R www-data:www-data /opt/dashboard-facturacion && sudo systemctl restart dashboard-facturacion"
```

## 9. Antes de produccion

- Cambiar `ADMIN_PASSWORD`.
- Cambiar `SECRET_KEY`.
- Confirmar que el JSON de Google no esta en ningun repositorio.
- Confirmar que la Google Sheet esta compartida solo con la cuenta de servicio como lector.
- Usar HTTPS antes de dar acceso a usuarios.
