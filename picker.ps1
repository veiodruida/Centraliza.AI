param([string]$initialPath, [string]$description = "Select a folder for Centraliza.ai", [switch]$SelfTest)

# Seletor de pasta moderno (estilo Explorer) via IFileOpenDialog + FOS_PICKFOLDERS.
# A lógica COM vive em C# (o cast de interface COM falha em PowerShell puro),
# exposta como [Picker]::PickFolder. Só imprime no stdout o caminho escolhido;
# erros vão para stderr com exit code 1.
#
# Para o diálogo aparecer POR CIMA de janelas em ecrã inteiro (browser):
# - a janela dona (1x1, invisível) é FORÇADA a WS_EX_TOPMOST via SetWindowPos e
#   posicionada no centro do ecrã (o diálogo owned aparece por cima dela);
# - uma thread vigilante força topmost + foreground em TODAS as janelas visíveis
#   deste processo enquanto o diálogo estiver aberto (o Show() bloqueia).
#
# -SelfTest: apenas compila o C# e imprime SELFTEST_OK (sem abrir diálogo).

$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Windows.Forms
    $pickerCode = @"
using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

public class Picker
{
    [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
    class FileOpenDialogRCW { }

    [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFileOpenDialog
    {
        [PreserveSig] int Show(IntPtr hwndOwner);
        [PreserveSig] int SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
        [PreserveSig] int SetFileTypeIndex(uint iFileType);
        [PreserveSig] int GetFileTypeIndex(out uint piFileType);
        [PreserveSig] int Advise(IntPtr pfde, out uint pdwCookie);
        [PreserveSig] int Unadvise(uint dwCookie);
        [PreserveSig] int SetOptions(uint fos);
        [PreserveSig] int GetOptions(out uint pfos);
        [PreserveSig] int SetDefaultFolder(IShellItem psi);
        [PreserveSig] int SetFolder(IShellItem psi);
        [PreserveSig] int GetFolder(out IShellItem ppsi);
        [PreserveSig] int GetCurrentSelection(out IShellItem ppsi);
        [PreserveSig] int SetFileName(string pszName);
        [PreserveSig] int GetFileName(out string pszName);
        [PreserveSig] int SetTitle(string pszTitle);
        [PreserveSig] int SetOkButtonLabel(string pszText);
        [PreserveSig] int SetFileNameLabel(string pszLabel);
        [PreserveSig] int GetResult(out IShellItem ppsi);
        [PreserveSig] int AddPlace(IShellItem psi, int fdap);
        [PreserveSig] int SetDefaultExtension(string pszDefaultExtension);
        [PreserveSig] int Close(int hr);
        [PreserveSig] int SetClientGuid(ref Guid guid);
        [PreserveSig] int ClearClientData();
        [PreserveSig] int SetFilter(IntPtr pFilter);
        [PreserveSig] int GetResults(out IntPtr ppenum);
        [PreserveSig] int GetSelectedItems(out IntPtr ppenum);
    }

    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItem
    {
        [PreserveSig] int BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        [PreserveSig] int GetParent(out IntPtr ppsi);
        [PreserveSig] int GetDisplayName(uint sigdnName, out IntPtr ppszName);
        [PreserveSig] int GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        [PreserveSig] int Compare(IntPtr psi, uint hint, out int piOrder);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern int SHCreateItemFromParsingName(string pszPath, IntPtr pbc, ref Guid riid, out IShellItem ppv);

    [DllImport("user32.dll")]
    static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("kernel32.dll")]
    static extern int GetCurrentProcessId();

    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    const uint FOS_PICKFOLDERS = 0x20;
    const uint FOS_FORCEFILESYSTEM = 0x40;
    const uint FOS_PATHMUSTEXIST = 0x800;
    const uint FOS_NOCHANGEDIR = 0x8;
    const uint SIGDN_FILESYSPATH = 0x80058000;
    static readonly Guid IID_IShellItem = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");
    static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    const uint SWP_NOSIZE = 0x0001;
    const uint SWP_NOMOVE = 0x0002;
    const uint SWP_NOACTIVATE = 0x0010;

    public static string PickFolder(string initialPath, string description)
    {
        IFileOpenDialog dlg = (IFileOpenDialog)new FileOpenDialogRCW();
        dlg.SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST | FOS_NOCHANGEDIR);
        if (!string.IsNullOrEmpty(description)) dlg.SetTitle(description);
        dlg.SetOkButtonLabel("Select Folder");

        if (!string.IsNullOrEmpty(initialPath) && System.IO.Directory.Exists(initialPath))
        {
            IShellItem folder = null;
            Guid riid = IID_IShellItem;
            int hr = SHCreateItemFromParsingName(initialPath, IntPtr.Zero, ref riid, out folder);
            if (hr == 0 && folder != null) dlg.SetFolder(folder);
        }

        // Janela dona: 1x1 centrada no ecrã, FORÇADA a topmost. O diálogo é uma
        // janela owned — aparece por cima dela e, por isso, por cima do browser.
        var screen = Screen.PrimaryScreen.WorkingArea;
        Form form = new Form();
        form.ShowInTaskbar = false;
        form.FormBorderStyle = FormBorderStyle.None;
        form.Size = new System.Drawing.Size(1, 1);
        form.StartPosition = FormStartPosition.Manual;
        form.Location = new System.Drawing.Point(
            screen.Left + (screen.Width - 1) / 2,
            screen.Top + (screen.Height - 1) / 2);
        form.Show();
        SetWindowPos(form.Handle, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        SetForegroundWindow(form.Handle);

        // Vigilante: enquanto o Show() bloqueia, eleva a topmost e traz para a
        // frente TODAS as janelas visíveis deste processo (o diálogo incluído),
        // garantindo que aparece acima de browsers em ecrã inteiro.
        bool[] stopWatchdog = new bool[1];
        Thread wd = new Thread(() =>
        {
            int pid = GetCurrentProcessId();
            int guard = 0;
            while (!stopWatchdog[0] && guard < 200)
            {
                guard++;
                EnumWindows(delegate(IntPtr h, IntPtr lp)
                {
                    uint wpid;
                    GetWindowThreadProcessId(h, out wpid);
                    if (wpid == (uint)pid && IsWindowVisible(h))
                    {
                        SetWindowPos(h, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                        SetForegroundWindow(h);
                    }
                    return true;
                }, IntPtr.Zero);
                Thread.Sleep(200);
            }
        });
        wd.IsBackground = true;
        wd.Start();

        int result = dlg.Show(form.Handle);
        stopWatchdog[0] = true;
        wd.Join(500);
        form.Close();

        if (result != 0) return null; // cancelado (ou erro)

        IShellItem item = null;
        dlg.GetResult(out item);
        if (item == null) return null;

        IntPtr psz = IntPtr.Zero;
        item.GetDisplayName(SIGDN_FILESYSPATH, out psz);
        if (psz == IntPtr.Zero) return null;
        string picked = Marshal.PtrToStringUni(psz);
        Marshal.FreeCoTaskMem(psz);
        return picked;
    }
}
"@
    Add-Type -TypeDefinition $pickerCode -ReferencedAssemblies 'System.Windows.Forms', 'System.Drawing'

    if ($SelfTest) { Write-Output 'SELFTEST_OK'; exit 0 }

    $picked = [Picker]::PickFolder($initialPath, $description)
    if ($picked) { Write-Output $picked }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
