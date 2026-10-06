/**
 * Optional local replica of the the-internet.herokuapp.com pages under test.
 *
 * WHY THIS EXISTS
 * The suite targets the live app by default. But the live app is a free, shared
 * Heroku dyno that is periodically unable to serve the ~7 concurrent
 * subresource requests a browser page load needs -- during development it
 * served sequential requests fine while timing out every concurrent one, which
 * blocks page loads entirely. This replica makes it possible to (a) validate
 * locators and assertions while the upstream is down, and (b) run the
 * `--repeat-each` stability check deterministically, without an unreliable
 * third party deciding whether the run is green.
 *
 * FIDELITY AND ITS LIMITS
 * Markup under test -- element ids, label/input wiring, accessible names, the
 * inline `display:none` on #finish, the 5000ms reveal delay -- is copied
 * verbatim from the live app as captured over curl, so the same locators and
 * the same timeout reasoning apply. Two deliberate differences:
 *   - The page scripts are rewritten in vanilla JS instead of jQuery. The
 *     observable DOM mutations and their timing are identical; this avoids
 *     vendoring ~96KB of jQuery to reproduce behaviour the tests observe only
 *     through the DOM.
 *   - Decorative assets (app.css, font-awesome, jQuery UI, images) are omitted.
 *     No assertion depends on them; #finish's hidden state is an inline style.
 * It is a harness for the pages under test, NOT a general-purpose stand-in for
 * the app, and passing against it is not a substitute for passing against live.
 *
 * Usage: npm run local-app   (then BASE_URL=http://127.0.0.1:3100 npm test)
 */
const http = require('http');

const VALID = { username: 'tomsmith', password: 'SuperSecretPassword!' };

const FLASH = {
  loginSucceeded: 'You logged into a secure area!',
  logoutSucceeded: 'You logged out of the secure area!',
  invalidUsername: 'Your username is invalid!',
  invalidPassword: 'Your password is invalid!',
  loginRequired: 'You must login to view the secure area!',
};

const layout = (flash, body) => `<!DOCTYPE html>
<html class="no-js" lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>The Internet</title>
  </head>
  <body>
    <div class="row">
      <div id="flash-messages" class="large-12 columns">
${
  flash
    ? `        <div data-alert id='flash' class='flash ${flash.type}'>
            ${flash.message}
            <a href="#" class="close">&times;</a>
          </div>`
    : ''
}
      </div>
    </div>
    <div class="row">
      <div id="content" class="large-12 columns">
${body}
      </div>
    </div>
  </body>
</html>`;

const LOGIN_BODY = `        <div class="example">
  <h2>Login Page</h2>
  <h4 class="subheader">This is where you can log into the secure area.</h4>
  <form name="login" id="login" action="/authenticate" method="post">
    <div class="row">
      <div class="large-6 small-12 columns">
        <label for="username">Username</label>
        <input type="text" name="username" id="username" />
      </div>
    </div>
    <div class="row">
      <div class="large-6 small-12 columns">
        <label for="password">Password</label>
        <input type="password" name="password" id="password" />
      </div>
    </div>
    <button class="radius" type="submit"><i class="fa fa-2x fa-sign-in"> Login</i></button>
  </form>
</div>`;

/* The <h4> subheader also contains "Secure Area", which is exactly why the
   page object's heading locator needs `exact: true`. Kept verbatim so the
   replica reproduces that strict-mode trap rather than hiding it. */
const SECURE_BODY = `        <div class="example">
  <h2><i class="icon-lock"></i> Secure Area</h2>
  <h4 class="subheader">Welcome to the Secure Area. When you are done click logout below.</h4>
  <a class="button secondary radius" href="/logout"><i class="icon-2x icon-signout"> Logout</i></a>
</div>`;

const CHECKBOXES_BODY = `        <div class="example">
  <h3>Checkboxes</h3>
  <form id='checkboxes'>
    <input type="checkbox"> checkbox 1<br>
    <input type="checkbox" checked> checkbox 2
  </form>
</div>
<script>
  var inputs = document.getElementById('checkboxes').getElementsByTagName('input');
  for (var i = 0; i < inputs.length; i++) {
    inputs[i].onclick = function () {
      this.checked ? this.setAttribute('checked', '') : this.removeAttribute('checked');
    };
  }
</script>`;

/**
 * Example 1 keeps #finish in the DOM but hidden; example 2 injects it only
 * after the delay. The 5000ms matches the live app exactly -- it is the whole
 * reason the finish assertion needs an explicit timeout.
 */
const dynamicLoadingBody = (example) => `        <div class='example'>
  <h3>Dynamically Loaded Page Elements</h3>
  <h4>Example ${example}</h4>
  <br>
  <div id='start'>
    <button>Start</button>
  </div>
${example === 1 ? `  <div id='finish' style='display:none'>\n    <h4>Hello World!</h4>\n  </div>\n` : ''}</div>
<script>
  document.querySelector('#start button').addEventListener('click', function () {
    var start = document.getElementById('start');
    start.style.display = 'none';

    var loading = document.createElement('div');
    loading.id = 'loading';
    loading.textContent = 'Loading...';
    start.parentNode.insertBefore(loading, start);

    setTimeout(function () {
      // The live app calls .hide() and leaves the node in the DOM, so the
      // correct end-state assertion is toBeHidden(), not toHaveCount(0).
      loading.style.display = 'none';
${
  example === 2
    ? `      var finish = document.createElement('div');
      finish.id = 'finish';
      finish.innerHTML = '<h4>Hello World!</h4>';
      finish.style.display = 'none';
      loading.parentNode.insertBefore(finish, loading);
`
    : `      var finish = document.getElementById('finish');
`
}      finish.style.display = '';
    }, 5000);
  });
</script>`;

const parseCookies = (req) =>
  Object.fromEntries(
    (req.headers.cookie ?? '')
      .split(';')
      .map((c) => c.trim().split('='))
      .filter(([k]) => k)
      .map(([k, v]) => [k, decodeURIComponent(v ?? '')]),
  );

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'text/html;charset=utf-8', ...headers });
  res.end(body);
};

const setFlash = (type, message) => [
  `flash=${encodeURIComponent(JSON.stringify({ type, message }))}; Path=/`,
];

/** Flash messages are one-shot: reading one also returns a header clearing it. */
const takeFlash = (cookies) => {
  const clear = ['flash=; Path=/; Max-Age=0'];
  if (!cookies.flash) return [null, []];
  try {
    return [JSON.parse(cookies.flash), clear];
  } catch {
    return [null, clear];
  }
};

const authenticate = (req, res) => {
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    const form = new URLSearchParams(raw);
    const username = form.get('username') ?? '';
    const password = form.get('password') ?? '';

    // Username is validated first, matching the live app -- which is why empty
    // credentials surface the username error, not a password error.
    if (username !== VALID.username) {
      return send(res, 303, '', {
        Location: '/login',
        'Set-Cookie': setFlash('error', FLASH.invalidUsername),
      });
    }
    if (password !== VALID.password) {
      return send(res, 303, '', {
        Location: '/login',
        'Set-Cookie': setFlash('error', FLASH.invalidPassword),
      });
    }
    return send(res, 303, '', {
      Location: '/secure',
      'Set-Cookie': [...setFlash('success', FLASH.loginSucceeded), 'session=tomsmith; Path=/'],
    });
  });
};

const PAGES = {
  '/login': LOGIN_BODY,
  '/checkboxes': CHECKBOXES_BODY,
  '/dynamic_loading/1': dynamicLoadingBody(1),
  '/dynamic_loading/2': dynamicLoadingBody(2),
};

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const cookies = parseCookies(req);

  if (req.method === 'POST' && pathname === '/authenticate') return authenticate(req, res);

  if (pathname === '/logout') {
    return send(res, 303, '', {
      Location: '/login',
      'Set-Cookie': [...setFlash('success', FLASH.logoutSucceeded), 'session=; Path=/; Max-Age=0'],
    });
  }

  if (pathname === '/secure') {
    if (!cookies.session) {
      return send(res, 303, '', {
        Location: '/login',
        'Set-Cookie': setFlash('error', FLASH.loginRequired),
      });
    }
    const [flash, clear] = takeFlash(cookies);
    return send(res, 200, layout(flash, SECURE_BODY), { 'Set-Cookie': clear });
  }

  const [flash, clear] = takeFlash(cookies);
  const body = PAGES[pathname];
  return body
    ? send(res, 200, layout(flash, body), { 'Set-Cookie': clear })
    : send(res, 404, layout(flash, '        <h1>Not Found</h1>'), { 'Set-Cookie': clear });
});

const port = Number(process.env.PORT ?? 3100);
server.listen(port, () => {
  console.log(`Local replica listening on http://127.0.0.1:${port}`);
  console.log(`Run the suite against it with:\n  BASE_URL=http://127.0.0.1:${port} npm test`);
});
