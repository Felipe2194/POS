; Personalización del instalador de POS Comidas (electron-builder lo incluye solo).
; Guardar en UTF-8.

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "¡Bienvenido a POS Comidas!"
  !define MUI_WELCOMEPAGE_TITLE_3LINES
  !define MUI_WELCOMEPAGE_TEXT "Este asistente va a instalar POS Comidas (versión ${VERSION}) en tu computadora.$\r$\n$\r$\nEs el sistema para vender rápido en festivales y eventos: cobro en un toque, control de caja, verificación de transferencias y ticketera.$\r$\n$\r$\nFunciona sin internet. Las ventas quedan guardadas en esta computadora.$\r$\n$\r$\nSi ya tenías una versión anterior, se actualiza y no se pierde ningún dato.$\r$\n$\r$\nTocá $\"Siguiente$\" para continuar."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  !define MUI_FINISHPAGE_TITLE "¡Listo! POS Comidas está instalado"
  !define MUI_FINISHPAGE_TITLE_3LINES
  !define MUI_FINISHPAGE_TEXT "Ya podés empezar a vender.$\r$\n$\r$\nVas a encontrar el ícono de POS Comidas en el escritorio y en el menú Inicio.$\r$\n$\r$\nPrimeros pasos:$\r$\n  1. Cargá tus productos y precios.$\r$\n  2. Configurá la ticketera.$\r$\n  3. Abrí la caja y ¡a vender!"
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "Abrir POS Comidas ahora"
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Desinstalar POS Comidas"
  !define MUI_WELCOMEPAGE_TEXT "Este asistente va a quitar POS Comidas de tu computadora.$\r$\n$\r$\nTus ventas, cajas y productos NO se borran: quedan guardados por si lo volvés a instalar.$\r$\n$\r$\nTocá $\"Siguiente$\" para continuar."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
