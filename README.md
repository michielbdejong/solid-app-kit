# solid-app-kit

A server that includes both a pod server and an app

See https://github.com/michielbdejong/solid-app-kit/blob/master/src/examples/basic.ts
for an example.

- Clone this repo
- run: npm install
- run: npm run build
- run: openssl req -nodes -new -x509 -subj "/C=US/ST=Denial/L=Springfield/O=Dis/CN=localhost" -keyout server.key -out server.cert
- run: node lib/cli.js public/
- With Chrome, visit chrome://flags/#allow-insecure-localhost
- Enable and restart Chrome
- Visit https://localhost:8080/
- Click 'Log in / Register'
- It will fail with redirect_uris for web clients using implicit flow must not be using localhost
- See https://github.com/michielbdejong/solid-app-kit/issues/2
