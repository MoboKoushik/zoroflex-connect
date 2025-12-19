; Custom NSIS installer script for Zoroflex Connect
; Adds Terms & Conditions page and Desktop Shortcut option checkbox

!include "MUI2.nsh"
!include "nsDialogs.nsh"

Var TermsAccepted
Var DesktopShortcutCheckbox
Var TermsCheckboxHandle

; Initialize variables
!macro customInit
    StrCpy $TermsAccepted "0"
!macroend

; Custom Terms & Conditions page
Function ShowTermsPage
    !insertmacro MUI_HEADER_TEXT "License Agreement" "Please review the license terms before installing"
    
    nsDialogs::Create 1018
    Pop $0
    
    ${NSD_CreateLabel} 0 0 100% 10u "Please read the license agreement below. You must accept to continue:"
    Pop $0
    
    ; Terms text (read-only)
    ${NSD_CreateTextMultiline} 0 15u 100% 180u "SOFTWARE LICENSE AGREEMENT$\r$\n$\r$\nZoroflex Connect$\r$\nCopyright (c) 2025 Zoroflex Solutions. All rights reserved.$\r$\n$\r$\nIMPORTANT - READ CAREFULLY: This License Agreement is a legal agreement between you and Zoroflex Solutions for the Zoroflex Connect software product.$\r$\n$\r$\nBy installing, copying, or otherwise using the Software, you agree to be bound by the terms of this Agreement. If you do not agree, do not install or use the Software.$\r$\n$\r$\nLICENSE GRANT: Zoroflex Solutions grants you a limited, non-exclusive, non-transferable license to install and use the Software on a single computer or device for your internal business purposes.$\r$\n$\r$\nRESTRICTIONS: You may not modify, adapt, alter, translate, or create derivative works of the Software; reverse engineer, decompile, disassemble the Software; or distribute, sublicense, lease, rent, loan, or transfer the Software to any third party.$\r$\n$\r$\nTERMINATION: This Agreement is effective until terminated. Your rights will terminate automatically if you fail to comply with any term of this Agreement.$\r$\n$\r$\nDISCLAIMER: THE SOFTWARE IS PROVIDED 'AS IS' WITHOUT WARRANTY OF ANY KIND.$\r$\n$\r$\nLIMITATION OF LIABILITY: ZOROFLEX SOLUTIONS SHALL NOT BE LIABLE FOR ANY SPECIAL, INCIDENTAL, INDIRECT, OR CONSEQUENTIAL DAMAGES."
    Pop $0
    SendMessage $0 ${EM_SETREADONLY} 1 0
    ${NSD_AddStyle} $0 ${WS_VSCROLL}|${ES_MULTILINE}
    
    ; Terms acceptance checkbox
    ${NSD_CreateCheckbox} 0 200u 100% 12u "I accept the terms of the License Agreement"
    Pop $TermsCheckboxHandle
    ${NSD_OnClick} $TermsCheckboxHandle OnTermsCheckboxClick
    
    ; Desktop Shortcut Checkbox
    ${NSD_CreateCheckbox} 0 220u 100% 12u "Create a desktop shortcut"
    Pop $DesktopShortcutCheckbox
    ${NSD_Check} $DesktopShortcutCheckbox
    
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

Function OnTermsPageLeave
    ${If} $TermsAccepted != "1"
        MessageBox MB_ICONEXCLAMATION|MB_OK "You must accept the license agreement to continue."
        Abort
    ${EndIf}
FunctionEnd

; Custom install - create desktop shortcut if checkbox was checked
!macro customInstall
    ${NSD_GetState} $DesktopShortcutCheckbox $0
    ${If} $0 == "1"
        CreateShortcut "$DESKTOP\Zoroflex Connect.lnk" "$INSTDIR\${PRODUCT_FILENAME}"
    ${EndIf}
!macroend

!macro customUnInstall
    Delete "$DESKTOP\Zoroflex Connect.lnk"
!macroend

; Insert custom page
Page custom ShowTermsPage OnTermsPageLeave