// Publica una versión nueva para que les llegue a los clientes.
// Uso: 1) subir "version" en package.json  2) npm run release
// Arma el instalador y lo sube como Release al repo público de instaladores
// (el código fuente sigue en el repo privado; ahí solo va el .exe y latest.yml).
const { execSync } = require('child_process');
const pkg = require('../package.json');

const run = (cmd, env) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });

let token = process.env.GH_TOKEN;
if (!token) {
  try { token = execSync('gh auth token', { encoding: 'utf8' }).trim(); } catch {}
}
if (!token) {
  console.error('Falta el token de GitHub: iniciá sesión con "gh auth login" o definí GH_TOKEN.');
  process.exit(1);
}

const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
if (dirty) {
  console.error('Hay cambios sin commitear. Commiteá antes de publicar para saber qué código tiene cada versión.');
  process.exit(1);
}

console.log(`\nPublicando POS Comidas v${pkg.version}…\n`);
run('npx vite build');
run('npx electron-builder --win --publish always', { GH_TOKEN: token });

try { run(`git tag v${pkg.version}`); console.log(`\nEtiqueta v${pkg.version} creada (recordá "git push --tags").`); } catch {}
console.log(`\nListo: los clientes van a recibir el aviso de la versión ${pkg.version} la próxima vez que tengan internet.`);
