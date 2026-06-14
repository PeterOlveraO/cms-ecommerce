# Cambios en la API - Guía para el Frontend

Este documento resume los cambios recientes en la base de datos y la API que deben reflejarse en las aplicaciones de Frontend (la tienda pública y el CMS de gestión).

## 1. Productos (`/products`)

Los payloads para crear y actualizar productos, así como las respuestas del servidor, tienen nuevos formatos:

*   **Imagen opcional:** El campo `image_url` ahora es opcional y acepta valores nulos (`null`). En el formulario del CMS, subir una imagen ya no debe ser un requerimiento estricto.
*   **Producto destacado:** Se agregó el campo booleano `featured`. 
    *   **En el CMS:** Se debe agregar un _switch_ o _checkbox_ en el formulario de creación/edición para marcar si el producto es "Destacado".
    *   **En la Tienda:** Se puede utilizar este campo para filtrar o resaltar productos especiales en la página de inicio.

**Ejemplo de Payload (Crear/Editar Producto):**
```json
{
  "name": "Camiseta Básica",
  "brand": "Marca X",
  "price": 200.50,
  "stock": 50,
  "display_order": 1,
  "image_url": null,  // <-- Ahora puede ser null o no enviarse
  "featured": true    // <-- Nuevo campo booleano
}
```

---

## 2. Clientes y Registro (`/customers` y `/register`)

Se ha agregado el campo de colonia/barrio a la información de dirección del cliente.

*   **Nuevo campo `neighborhood`:** Es un campo de texto (máximo 150 caracteres) y es **opcional**.
*   **Formulario de Registro (Tienda pública):** Debería añadirse un nuevo input (ej. "Colonia / Barrio") en la sección de dirección del proceso de registro (Checkout o Sign Up).
*   **Formulario de Edición de Perfil:** El usuario desde "Mi Cuenta" o el administrador desde el CMS deben poder visualizar y editar este nuevo campo.

**Ejemplo de Payload de Registro o Actualización:**
```json
{
  "first_name": "Juan",
  "last_name": "Pérez",
  "street_address": "Av. Reforma",
  "exterior_number": "123",
  "neighborhood": "Centro Histórico", // <-- Nuevo campo opcional
  "postal_code": "06000",
  "city": "Ciudad de México",
  "state": "CDMX",
  "phone": "5551234567"
}
```

---

## 3. Nuevo Módulo: Atributos (`/attributes`)

Se agregó toda la estructura necesaria para gestionar atributos (ej. Tallas, Colores, Materiales). El CMS debe implementar una nueva pantalla para administrar este catálogo.

**Rutas disponibles:**

*   `GET /attributes` - Obtiene la lista de atributos activos (Público).
*   `GET /attributes/:id` - Obtiene el detalle de un atributo por ID (Público).
*   `POST /attributes` - Crea un nuevo atributo (Requiere token Admin).
*   `PUT /attributes/:id` - Actualiza un atributo existente (Requiere token Admin).
*   `DELETE /attributes/:id` - Elimina un atributo por ID (Requiere token Admin).

**Payload esperado para POST y PUT:**
```json
{
  "name": "Talla" // Nombre del atributo (máx. 100 caracteres)
}
```

**Respuesta estándar (GET listado):**
```json
{
  "success": true,
  "message": "Atributos obtenidos",
  "data": [
    {
      "id": "uuid-generado",
      "name": "Talla",
      "is_active": 1,
      "created_at": "2026-06-14T12:00:00.000Z",
      "updated_at": "2026-06-14T12:00:00.000Z"
    }
  ]
}
```
