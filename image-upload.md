# Manejo de Imágenes en Ecommerce

Esta guía detalla cómo funciona el servicio de almacenamiento de imágenes en la API y cómo interactuar con él desde el frontend (CMS o Tienda).

## 1. El Endpoint de Subida

Para subir cualquier imagen física al servidor (fotos de producto, banners, imágenes de cabecera), debes hacer una petición al endpoint unificado de carga.

- **URL:** `/upload`
- **Método HTTP:** `POST`
- **Autenticación requerida:** Sí (Header `Authorization: Bearer <token>`)
- **Rol requerido:** `admin` (Solo un administrador puede subir imágenes)
- **Tipo de Petición:** `multipart/form-data`

### Restricciones de Seguridad
- **Formatos permitidos:** JPEG, PNG, WEBP, GIF.
- **Tamaño máximo:** 5 MB por archivo.

---

## 2. Cómo usarlo desde el Frontend (Ej. Astro / React)

Cuando el administrador selecciona un archivo local en el CMS, debes envolverlo en un objeto `FormData` y enviarlo mediante `fetch` o tu cliente preferido (como axios).

### Ejemplo de Integración en JavaScript:

```javascript
// Supongamos que tienes este input en tu UI:
// <input type="file" id="filePicker" accept="image/png, image/jpeg, image/webp" />

async function handleImageUpload() {
  const fileInput = document.getElementById('filePicker');
  const file = fileInput.files[0];

  if (!file) return alert("Selecciona una imagen");

  // 1. Crear el objeto FormData
  const formData = new FormData();
  // ⚠️ EL NOMBRE DEL CAMPO DEBE SER "image"
  formData.append('image', file);

  try {
    // 2. Hacer la petición POST
    const response = await fetch('http://localhost:3000/upload', {
      method: 'POST',
      headers: {
        // NOTA VITAL: ¡NO configures el 'Content-Type' manualmente!
        // Al mandar un FormData, el navegador asigna automáticamente
        // 'multipart/form-data' junto con el 'boundary' necesario.
        'Authorization': `Bearer ${localStorage.getItem('token_admin')}`
      },
      body: formData
    });

    const data = await response.json();

    if (response.ok) {
      // 3. Capturar la URL relativa devuelta por el servidor
      const imageUrl = data.data.url; // Ejemplo: "/uploads/ab3...9f1.jpg"
      console.log('Imagen subida, guardada en:', imageUrl);
      
      // 4. (Siguiente Paso) 
      // Ahora puedes enviar esta 'imageUrl' como string ('image_url')
      // en tu petición POST/PUT hacia la creación de un /products o /categories.
      
    } else {
      alert('Error del servidor: ' + data.message);
    }
  } catch (error) {
    console.error('Error de red:', error);
  }
}
```

---

## 3. Consumir/Visualizar las Imágenes

Una vez que la imagen fue cargada exitosamente, se guarda en el backend en la carpeta estática `public/uploads`. 

Si el endpoint de `upload` te devuelve `/uploads/foto.jpg` y lo guardaste así en la base de datos (por ejemplo, en el campo `image_url` de un producto), tu frontend simplemente tiene que concatenar la ruta raíz de la API para mostrarla:

```html
<!-- Mostrando la imagen en el Frontend de la Tienda -->
<img 
  src="http://localhost:3000/uploads/foto.jpg" 
  alt="Foto del Producto" 
/>
```

**Recomendación:** Ten una variable de entorno global en tu frontend (ej. `PUBLIC_API_URL="http://localhost:3000"`) y úsala como prefijo cada vez que vayas a imprimir una imagen.
