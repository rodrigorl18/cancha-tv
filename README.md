# Cancha TV

Archivos públicos de la app web y APK Android/Android TV 1.2-preview.

## Publicación y actualizaciones

GitHub Actions publica el sitio y actualiza guide.json cada tres horas. Pages utiliza el workflow refresh-guide.yml. La aplicación consulta esa guía cada 15 minutos con conexión; no necesita reinstalarse para recibir programación.

Para publicar cambios, exportar de nuevo el proyecto original con scripts/package-pages.mjs y actualizar estos archivos en este mismo repositorio. La app web recibe los archivos publicados al abrir o recargar con conexión. Desde 1.1, la app comprueba versiones nuevas, descarga el APK y abre el instalador del sistema con confirmación. Pasar de 1.0 a 1.1 requiere instalar una vez encima de la versión anterior. El catálogo se actualiza sin reinstalar.

## Android y TV

APK: [Descargar Cancha TV](./tv.apk). Android 6 o superior; no funciona en Vega OS. La compatibilidad física con teléfono, Android TV y Fire TV está pendiente de prueba.

SHA-256: `fa4329066774754a347d81e24b364a0ae3883a1ac1cf515c0aa842fca6aff1c3`.

El catálogo identifica canales candidatos, no garantiza partidos ni disponibilidad de señales. Los videos dependen de sus servidores y de la red del dispositivo.
