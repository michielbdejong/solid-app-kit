# solid-app-kit

A server that includes both a pod server and an app

See https://github.com/michielbdejong/solid-app-kit/blob/master/src/examples/basic.ts
for an example.

See https://stackoverflow.com/questions/7580508/getting-chrome-to-accept-self-signed-localhost-certificate
for more info on the root certificate thing:

```sh
npm install
npm run build
NAME=lolcathost.de
######################
# Become a Certificate Authority
######################

# Generate private key
openssl genrsa -des3 -out myCA.key 2048
# Generate root certificate
openssl req -x509 -new -nodes -key myCA.key -sha256 -days 825 -out myCA.pem -subj "/C=US/ST=Denial/L=Springfield/O=Dis/CN=$NAME"

######################
# Create CA-signed certs
######################

# Generate private key
[[ -e $NAME.key ]] || openssl genrsa -out $NAME.key 2048
# Create certificate-signing request
[[ -e $NAME.csr ]] || openssl req -new -key $NAME.key -out $NAME.csr -subj "/C=US/ST=Denial/L=Springfield/O=Dis/CN=$NAME"
# Create a config file for the extensions
>$NAME.ext cat <<-EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names
[alt_names]
DNS.1 = $NAME
DNS.2 = bar.$NAME
EOF
# Create the signed certificate
openssl x509 -req -in $NAME.csr -CA myCA.pem -CAkey myCA.key -CAcreateserial \
-out $NAME.crt -days 825 -sha256 -extfile $NAME.ext
```

- run: node lib/cli.js public/
- With Chrome, visit chrome://flags/#allow-insecure-localhost
- Enable and restart Chrome
- Visit https://localhost:8080/
- Click 'Log in / Register'
- It will fail with redirect_uris for web clients using implicit flow must not be using localhost
- See https://github.com/michielbdejong/solid-app-kit/issues/2
