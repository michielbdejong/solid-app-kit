# solid-app-kit

A server that includes both a pod server and an app

See https://github.com/michielbdejong/solid-app-kit/blob/master/src/cli.ts
for an example.

## On localhost

Previously there were several ways to test https-based systems on localhost,
but in the last few years, browsers have tightened that up a lot, meaning you
want to steer clear of using 'localhost' or '127.0.0.1' as the hostname. You
can use a domain name which you point to 127.0.0.1 in your /etc/hosts. I
personally like to use https://lolcathost.de/ which is a domain name that exists
but is pointed to 127.0.0.1 in DNS. Long story short, you'll need to generate
a CA root certificate, and import it into your browser, then sign a cert for the
domain name you wil be testing with.
See https://stackoverflow.com/questions/7580508/getting-chrome-to-accept-self-signed-localhost-certificate
for more info on that. Once you've done that, you can:

```sh
npm install
npm run build
NODE_EXTRA_CA_CERTS=myCA.pem DEBUG=* node lib/cli public/
```

and visit https://lolcathost.de/ (or whichever domain name you chose) to view the app.
Make sure to click "Register" to create an account when using your Solid App Kit server
for the first time!

# On a server

Coming soon (blocked on https://github.com/michielbdejong/get-lets-encrypt-servers/issues/2).
