# Fixture dei test — solo per i test

Certificato e chiave **autofirmati, generati per i test** di `src/lib/safe-request/`. Non proteggono niente e non vanno mai usati fuori dai test: la chiave è pubblica di proposito.

- `test-only-cert.pem` e `test-only-key.pem`: certificato per `esempio.test` (unico nome alternativo), valido fino al 2126. I test lo usano per un server HTTPS locale su `127.0.0.1` e lo passano come `ca` al modulo, per provare SNI e verifica del nome senza richieste a internet.

Per rigenerarli:

```sh
openssl req -x509 -newkey rsa:2048 -nodes -keyout test-only-key.pem -out test-only-cert.pem \
  -days 36500 -subj "/CN=esempio.test" -addext "subjectAltName=DNS:esempio.test"
```
