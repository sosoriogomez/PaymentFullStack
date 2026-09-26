/** Messages for the API and gateway error codes (`UiError.code`). */
export const errors = {
  NETWORK_ERROR: 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.',
  TIMEOUT: 'El servidor tardó demasiado en responder. Inténtalo de nuevo.',
  INVALID_RESPONSE: 'Recibimos una respuesta inesperada. Inténtalo de nuevo.',
  INSUFFICIENT_STOCK: 'Ya no hay unidades suficientes de este producto.',
  PRODUCT_NOT_FOUND: 'El producto ya no está disponible.',
  VALIDATION_ERROR: 'Revisa los datos ingresados.',
  GATEWAY_UNAVAILABLE: 'La pasarela de pagos no está disponible. Inténtalo en unos segundos.',
  GATEWAY_REJECTED: 'La pasarela de pagos rechazó la operación.',
  CARD_REJECTED: 'La pasarela rechazó los datos de la tarjeta. Verifícalos e inténtalo de nuevo.',
  TOO_MANY_REQUESTS: 'Hiciste demasiados intentos seguidos. Espera un momento.',
  CARD_REENTRY_REQUIRED: 'Por tu seguridad, vuelve a ingresar los datos de tu tarjeta.',
  generic: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
} as const;
