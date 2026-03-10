; NSIS installer script for Zorrofin Connect
; This file is included by electron-builder's NSIS installer

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; Variables
Var DesktopShortcutCheckbox
Var StartMenuShortcutCheckbox
Var AutoStartCheckbox

; Initialize variables
!macro customInit
    StrCpy $DesktopShortcutCheckbox "1"
    StrCpy $StartMenuShortcutCheckbox "1"
    StrCpy $AutoStartCheckbox "0"
!macroend

; Components/Options Page
Function ShowComponentsPage
    nsDialogs::Create 1018
    Pop $0

    ${NSD_CreateLabel} 0 0 100% 10u "Select the additional tasks you would like Setup to perform while installing Zorrofin Connect, then click Next."
    Pop $0

    ; Desktop Shortcut Checkbox
    ${NSD_CreateCheckbox} 0 30u 100% 12u "Create a desktop shortcut"
    Pop $DesktopShortcutCheckbox
    ${NSD_Check} $DesktopShortcutCheckbox

    ; Start Menu Shortcut Checkbox
    ${NSD_CreateCheckbox} 0 50u 100% 12u "Create a Start Menu shortcut"
    Pop $StartMenuShortcutCheckbox
    ${NSD_Check} $StartMenuShortcutCheckbox

    ; Auto-start with Windows Checkbox (unchecked by default)
    ${NSD_CreateCheckbox} 0 70u 100% 12u "Start Zorrofin Connect automatically when Windows starts"
    Pop $AutoStartCheckbox

    ${NSD_CreateLabel} 0 95u 100% 20u "Note: You can change these settings later from the application settings."
    Pop $0

    nsDialogs::Show
FunctionEnd

Function OnComponentsPageLeave
    ; Store checkbox states
    ${NSD_GetState} $DesktopShortcutCheckbox $0
    StrCpy $DesktopShortcutCheckbox $0

    ${NSD_GetState} $StartMenuShortcutCheckbox $0
    StrCpy $StartMenuShortcutCheckbox $0

    ${NSD_GetState} $AutoStartCheckbox $0
    StrCpy $AutoStartCheckbox $0
FunctionEnd

; Custom install section
!macro customInstall
    ; Create Desktop Shortcut if checked
    ${If} $DesktopShortcutCheckbox == "1"
        CreateShortcut "$DESKTOP\Zorrofin Connect.lnk" "$INSTDIR\${PRODUCT_FILENAME}.exe" "" "$INSTDIR\${PRODUCT_FILENAME}.exe" 0 SW_SHOWNORMAL "" ""
    ${EndIf}

    ; Create Start Menu Shortcut if checked
    ${If} $StartMenuShortcutCheckbox == "1"
        CreateDirectory "$SMPROGRAMS\Zorrofin Connect"
        CreateShortcut "$SMPROGRAMS\Zorrofin Connect\Zorrofin Connect.lnk" "$INSTDIR\${PRODUCT_FILENAME}.exe" "" "$INSTDIR\${PRODUCT_FILENAME}.exe" 0 SW_SHOWNORMAL "" ""
        CreateShortcut "$SMPROGRAMS\Zorrofin Connect\Uninstall Zorrofin Connect.lnk" "$INSTDIR\Uninstall ${PRODUCT_FILENAME}.exe"
    ${EndIf}

    ; Auto-start is managed by the application itself via app.setLoginItemSettings()
    ; User can enable/disable from Settings page inside the app
!macroend

; Custom uninstall section
!macro customUnInstall
    ; Remove Desktop Shortcut
    Delete "$DESKTOP\Zorrofin Connect.lnk"

    ; Remove Start Menu Shortcut
    RMDir /r "$SMPROGRAMS\Zorrofin Connect"

    ; Remove Auto-start registry entry (cleanup)
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ZorrofinConnect"
!macroend
