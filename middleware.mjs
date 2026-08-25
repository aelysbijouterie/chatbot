import { next } from '@vercel/functions';

// Protège tout le site (pages + API) par identifiant/mot de passe : un
// couple par magasin. La variable d'environnement STORE_CREDENTIALS
// (à configurer dans Vercel > Settings > Environment Variables) doit
// contenir un JSON du type {"200":"627111","300":"199510", ...}.
export const config = {
  matcher: '/((?!favicon.ico).*)',
};

function loadStores() {
  try {
    return JSON.parse(process.env.STORE_CREDENTIALS || '{}');
  } catch (e) {
    return {};
  }
}

export default function middleware(request) {
  const stores = loadStores();
  const authHeader = request.headers.get('authorization');

  if (authHeader && authHeader.startsWith('Basic ')) {
    const decoded = atob(authHeader.slice(6));
    const sep = decoded.indexOf(':');
    const code = sep === -1 ? decoded : decoded.slice(0, sep);
    const pwd = sep === -1 ? '' : decoded.slice(sep + 1);

    if (stores[code] && stores[code] === pwd) {
      return next();
    }
  }

  return new Response('Authentification requise', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="AUREL\'IA"' },
  });
}
