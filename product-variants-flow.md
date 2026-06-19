# Implementación de Variantes de Productos

Este documento detalla los cambios realizados en el sistema para soportar el manejo de inventario y compras a nivel de **Variantes de Producto** (ej. tallas, colores), sin romper el soporte para productos genéricos que no tienen variantes.

## 1. Modificaciones en la Base de Datos

Se detectaron las siguientes estructuras en la base de datos:

- **Tabla `product_variant` (Nueva):**  
  Controla el inventario de cada variación específica. Contiene las columnas `id`, `product_id`, `stock`, `variante1`, `variante2` y `is_active`.
- **Tabla `order_item` (Modificada):**  
  Se agregó la columna opcional `variant_id` (`char(36)`) para vincular el producto comprado con su variante exacta.

## 2. Cambios en el Backend

Se actualizó la lógica central del Ecommerce para que soporte descuentos de inventario "mixtos", es decir, de productos que tienen variantes y de productos que no las tienen.

### A. Capa de Modelos (`product.model.ts` y `order.model.ts`)
- Se agregaron las interfaces TypeScript correspondientes (`ProductVariant`).
- Se crearon las consultas seguras `findProductVariantById` (con soporte `FOR UPDATE` para bloqueo en transacciones atómicas) y `updateProductVariantStock`.
- Se actualizó el guardado (`insertOrderItems`) y lectura de órdenes (`findOrderById`) para incluir el `variant_id` en las consultas.

### B. Capa de Servicios (`order.service.ts`)
La función de creación de órdenes (`createOrder`) se volvió más inteligente:
1. Sigue validando y calculando el precio desde el producto original (garantizando seguridad).
2. Si la petición incluye un `variant_id`:
   - Bloquea la fila específica en la tabla `product_variant`.
   - Revisa si hay stock en esa variante.
   - Descuenta el stock directamente a `product_variant`.
3. Si la petición **no** incluye un `variant_id`:
   - El sistema actúa como siempre y descuenta el inventario general de la tabla `product`.

De igual forma, la cancelación de órdenes (`updateStatus`) revisa si se debe restaurar el stock a una variante o a un producto genérico.

## 3. Actualización de las Peticiones (Frontend)

Con esta actualización, cuando se deba procesar una compra de una variante, el Frontend debe incluir la propiedad `variant_id` dentro del arreglo de `items` del cuerpo de la solicitud `POST /orders`.

**Ejemplo del Payload (Body JSON):**

```json
{
  "payment_method_id": "8bb38f82-1c25-4c07-b769-cf56bdfa14b5",
  "shipping_cost": 150.00,
  "notes": "Entregar por la tarde",
  "items": [
    {
      "product_id": "0d6a2f3b-891d-4569-b5f7-f1e56b826bba",
      "variant_id": "77f3e1a1-9c65-4f32-bb9a-1123456789aa", 
      "quantity": 2
    },
    {
      "product_id": "8b9a1c22-31c4-4b5a-a1d2-0012395ab12c",
      "quantity": 1 
    }
  ]
}
```

> [!NOTE]
> Nota que el campo `variant_id` es opcional. El segundo artículo del ejemplo es un producto sin variantes, lo cual demuestra la flexibilidad del sistema para soportar carritos mixtos.
