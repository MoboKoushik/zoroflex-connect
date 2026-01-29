; Professional NSIS installer script for Zorrofin Connect
; VS Code style installer with proper installation steps and options
; This file is included by electron-builder's NSIS installer

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; Variables
Var TermsAccepted
Var DesktopShortcutCheckbox
Var StartMenuShortcutCheckbox
Var AutoStartCheckbox
Var TermsCheckboxHandle

; Initialize variables
!macro customInit
    StrCpy $TermsAccepted "0"
    StrCpy $DesktopShortcutCheckbox "1"
    StrCpy $StartMenuShortcutCheckbox "1"
    StrCpy $AutoStartCheckbox "1"
!macroend

; Hook into electron-builder's page flow
; Insert custom pages after welcome page
!macro customWelcomePage
    ; This runs after the welcome page
!macroend

; Custom License Page
Function ShowLicensePage
    !insertmacro MUI_HEADER_TEXT "License Agreement" "Please review the license terms before installing"
    
    nsDialogs::Create 1018
    Pop $0
    
    ${NSD_CreateLabel} 0 0 100% 10u "Please read the license agreement below. You must accept to continue:"
    Pop $0
    
    ; License text (embedded)
    ${NSD_CreateText} 0 15u 100% 180u "SOFTWARE LICENSE AGREEMENT$\r$\n$\r$\nZorrofin Connect$\r$\nCopyright (c) 2025 Zorrofin Solutions. All rights reserved.$\r$\n$\r$\nIMPORTANT - READ CAREFULLY: This License Agreement is a legal agreement between you and Zorrofin Solutions for the Zorrofin Connect software product.$\r$\n$\r$\nBy installing, copying, or otherwise using the Software, you agree to be bound by the terms of this Agreement. If you do not agree, do not install or use the Software.$\r$\n$\r$\nLICENSE GRANT: Zorrofin Solutions grants you a limited, non-exclusive, non-transferable license to install and use the Software on a single computer or device for your internal business purposes.$\r$\n$\r$\nRESTRICTIONS: You may not modify, adapt, alter, translate, or create derivative works of the Software; reverse engineer, decompile, disassemble the Software; or distribute, sublicense, lease, rent, loan, or transfer the Software to any third party.$\r$\n$\r$\nTERMINATION: This Agreement is effective until terminated. Your rights will terminate automatically if you fail to comply with any term of this Agreement.$\r$\n$\r$\nDISCLAIMER: THE SOFTWARE IS PROVIDED 'AS IS' WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.$\r$\n$\r$\nLIMITATION OF LIABILITY: ZORROFIN SOLUTIONS SHALL NOT BE LIABLE FOR ANY SPECIAL, INCIDENTAL, INDIRECT, OR CONSEQUENTIAL DAMAGES ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE SOFTWARE."
    Pop $0
    SendMessage $0 ${EM_SETREADONLY} 1 0
    System::Call "user32::SendMessage(i $0, i ${EM_SETWORDBREAKPROC}, i 0, i 0)"
    
    ; Terms acceptance checkbox
    ${NSD_CreateCheckbox} 0 200u 100% 12u "I accept the terms of the License Agreement"
    Pop $TermsCheckboxHandle
    ${NSD_OnClick} $TermsCheckboxHandle OnTermsCheckboxClick
    
    ; Disable Next button initially
    GetDlgItem $1 $HWNDPARENT 1
    EnableWindow $1 0
    
    nsDialogs::Show
FunctionEnd

Function OnTermsCheckboxClick
    Pop $1
    ${NSD_GetState} $TermsCheckboxHandle $2
    ${If} $2 == "1"
        StrCpy $TermsAccepted "1"
        GetDlgItem $3 $HWNDPARENT 1
        EnableWindow $3 1
    ${Else}
        StrCpy $TermsAccepted "0"
        GetDlgItem $3 $HWNDPARENT 1
        EnableWindow $3 0
    ${EndIf}
FunctionEnd

Function OnLicensePageLeave
    ${If} $TermsAccepted != "1"
        MessageBox MB_ICONEXCLAMATION|MB_OK "You must accept the license agreement to continue."
        Abort
    ${EndIf}
FunctionEnd

; Components/Options Page
Function ShowComponentsPage
    !insertmacro MUI_HEADER_TEXT "Select Additional Tasks" "Choose additional tasks you would like Setup to perform"
    
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
    
    ; Auto-start with Windows Checkbox
    ${NSD_CreateCheckbox} 0 70u 100% 12u "Start Zorrofin Connect automatically when Windows starts"
    Pop $AutoStartCheckbox
    ${NSD_Check} $AutoStartCheckbox
    
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

; Launch application function
Function LaunchApp
    Exec '"$INSTDIR\${PRODUCT_FILENAME}.exe"'
FunctionEnd

; Custom install section
!macro customInstall
    ; Create Desktop Shortcut if checked
    ${If} $DesktopShortcutCheckbox == "1"
        CreateShortcut "$DESKTOP\Zorrofin Connect.lnk" '"$INSTDIR\${PRODUCT_FILENAME}.exe"' "" '"$INSTDIR\${PRODUCT_FILENAME}.exe"' 0 SW_SHOWNORMAL "" ""
    ${EndIf}
    
    ; Create Start Menu Shortcut if checked
    ${If} $StartMenuShortcutCheckbox == "1"
        CreateDirectory "$SMPROGRAMS\Zorrofin Connect"
        CreateShortcut "$SMPROGRAMS\Zorrofin Connect\Zorrofin Connect.lnk" '"$INSTDIR\${PRODUCT_FILENAME}.exe"' "" '"$INSTDIR\${PRODUCT_FILENAME}.exe"' 0 SW_SHOWNORMAL "" ""
        CreateShortcut "$SMPROGRAMS\Zorrofin Connect\Uninstall Zorrofin Connect.lnk" "$INSTDIR\Uninstall ${PRODUCT_FILENAME}.exe"
    ${EndIf}
    
    ; Set Auto-start with Windows if checked
    ${If} $AutoStartCheckbox == "1"
        WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ZorrofinConnect" '"$INSTDIR\${PRODUCT_FILENAME}.exe"'
    ${EndIf}
!macroend

; Custom uninstall section
!macro customUnInstall
    ; Remove Desktop Shortcut
    Delete "$DESKTOP\Zorrofin Connect.lnk"
    
    ; Remove Start Menu Shortcut
    RMDir /r "$SMPROGRAMS\Zorrofin Connect"
    
    ; Remove Auto-start registry entry
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ZorrofinConnect"
!macroend
