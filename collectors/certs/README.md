# Certificados intermedios

`godaddy-secure-certificate-authority-g2.pem` completa la cadena TLS que
`www.corteconstitucional.gov.co` entregaba incompleta el 2026-08-30. El servidor
enviaba su certificado final y otras autoridades, pero omitía el intermediario
que figura como emisor del certificado final.

- Fuente declarada en AIA:
  `http://certificates.godaddy.com/repository/gdig2.crt`
- Sujeto: `Go Daddy Secure Certificate Authority - G2`
- SHA-256:
  `97:3A:41:27:6F:FD:01:E0:27:A2:AA:D4:9E:34:C3:78:46:D3:E9:76:FF:6A:62:0B:67:12:E3:38:32:04:1A:A6`
- Vigencia: 2011-05-03 a 2031-05-03

La huella se verifica antes de versionar el certificado. Esto no desactiva la
validación TLS ni la comprobación del hostname.
