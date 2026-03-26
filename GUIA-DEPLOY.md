# Cómo subir OrderFlow MX a GitHub y desplegarlo en Netlify

## Paso 1: Instalar Git (si no lo tienes)

### Mac:
```bash
# Abre Terminal y escribe:
git --version
# Si no lo tienes, te pedirá instalarlo automáticamente
```

### Windows:
Descarga Git de: https://git-scm.com/download/win
Instálalo con las opciones por defecto.

---

## Paso 2: Crear cuenta en GitHub

1. Ve a https://github.com
2. Clic en "Sign up"
3. Crea tu cuenta con email y contraseña
4. Verifica tu email

---

## Paso 3: Crear un repositorio nuevo en GitHub

1. Ya logueado, clic en el botón verde **"New"** (o ve a https://github.com/new)
2. Nombre del repositorio: `orderflow-mx`
3. Selecciona **Private** (para que no sea público)
4. NO marques "Add a README file"
5. Clic en **"Create repository"**
6. GitHub te mostrará una URL como: `https://github.com/TU-USUARIO/orderflow-mx.git` — cópiala

---

## Paso 4: Preparar tu proyecto localmente

Abre Terminal (Mac) o Git Bash (Windows) y ejecuta estos comandos uno por uno:

```bash
# 1. Crea una carpeta para tu proyecto
mkdir orderflow-mx
cd orderflow-mx

# 2. Copia tu archivo .jsx ahí (ajusta la ruta donde lo descargaste)
#    Por ejemplo, si lo descargaste en Downloads:
cp ~/Downloads/orderflow-final.jsx ./App.jsx

# 3. Crea el package.json
cat > package.json << 'EOF'
{
  "name": "orderflow-mx",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0"
  }
}
EOF

# 4. Crea el archivo de configuración de Vite
cat > vite.config.js << 'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
EOF

# 5. Crea el archivo index.html
cat > index.html << 'EOF'
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OrderFlow MX</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%232563eb'/><text x='16' y='22' text-anchor='middle' fill='white' font-size='14' font-weight='bold'>OF</text></svg>">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
EOF

# 6. Crea la carpeta src y el archivo main.jsx
mkdir -p src
cat > src/main.jsx << 'EOF'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
EOF

# 7. Mueve tu App.jsx a src/
mv App.jsx src/App.jsx

# 8. Crea el .gitignore
cat > .gitignore << 'EOF'
node_modules
dist
.env
.env.local
.DS_Store
EOF
```

---

## Paso 5: Probar localmente (opcional pero recomendado)

```bash
# Instalar dependencias
npm install

# Correr en local
npm run dev

# Abre http://localhost:5173 en tu navegador
# Si funciona, ya puedes subirlo a GitHub
```

---

## Paso 6: Subir a GitHub

```bash
# 1. Inicializar Git en tu carpeta
git init

# 2. Agregar todos los archivos
git add .

# 3. Hacer el primer commit
git commit -m "OrderFlow MX - versión inicial"

# 4. Conectar con tu repositorio de GitHub
#    (reemplaza TU-USUARIO con tu nombre de usuario de GitHub)
git remote add origin https://github.com/TU-USUARIO/orderflow-mx.git

# 5. Subir
git branch -M main
git push -u origin main
```

Te pedirá tu usuario y contraseña de GitHub.

**Nota:** GitHub ya no acepta contraseñas normales. Necesitas un "Personal Access Token":
1. Ve a https://github.com/settings/tokens
2. Clic en "Generate new token (classic)"
3. Nombre: "orderflow"
4. Marca el checkbox "repo"
5. Clic en "Generate token"
6. Copia el token (empieza con `ghp_...`)
7. Cuando te pida contraseña en la terminal, pega este token en lugar de tu contraseña

---

## Paso 7: Conectar Netlify

1. Ve a https://app.netlify.com
2. Crea cuenta (puedes usar tu cuenta de GitHub)
3. Clic en **"Add new site"** → **"Import an existing project"**
4. Selecciona **GitHub**
5. Autoriza Netlify a acceder a tus repos
6. Selecciona **orderflow-mx**
7. Configuración de build:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
8. Clic en **"Deploy site"**

Netlify construirá tu app y te dará una URL como:
`https://orderflow-mx-abc123.netlify.app`

---

## Paso 8: Personalizar el dominio (opcional)

1. En Netlify, ve a **Site settings** → **Domain management**
2. Clic en **"Change site name"**
3. Escribe algo como: `orderflow-mx`
4. Tu URL será: `https://orderflow-mx.netlify.app`

Si tienes un dominio propio:
1. Clic en **"Add custom domain"**
2. Sigue las instrucciones para configurar los DNS

---

## Actualizar la app después

Cada vez que hagas cambios:

```bash
# 1. Edita tus archivos

# 2. Guarda los cambios en Git
git add .
git commit -m "descripción del cambio"

# 3. Sube a GitHub
git push

# Netlify se entera automáticamente y re-despliega en ~30 segundos
```

---

## Estructura final de tu proyecto

```
orderflow-mx/
├── .gitignore
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx
    └── App.jsx        ← tu archivo orderflow-final.jsx renombrado
```

---

## Solución de problemas comunes

**"npm: command not found"**
→ Instala Node.js desde https://nodejs.org (versión LTS)

**"git: command not found"**
→ Instala Git desde https://git-scm.com

**Error de autenticación en GitHub**
→ Usa Personal Access Token, no contraseña

**Build falla en Netlify**
→ Revisa que el build command sea `npm run build` y publish directory sea `dist`
→ Revisa los logs de build en Netlify para ver el error específico

**Página en blanco después del deploy**
→ Asegúrate de que publish directory es `dist` (no `build` ni `public`)
