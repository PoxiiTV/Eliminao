// Eliminao — instalador para Windows
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Descarga el último release de GitHub (Vencord ya compilado con Eliminao), parchea Discord con el
// instalador oficial de Vencord y comprueba que de verdad lo carga. Sin Git ni Node: solo .NET 4.8,
// que ya viene con Windows 10/11. Compilar con build-exe.bat (C# 5, el compilador de Windows).

using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Cache;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("Eliminao - Instalador")]
[assembly: System.Reflection.AssemblyProduct("Eliminao")]
[assembly: System.Reflection.AssemblyDescription("Instala Eliminao (mensajes temporales para Discord)")]

static class Program
{
    [STAThread]
    static void Main()
    {
        ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new InstallerForm());
    }
}

// ---------------------------------------------------------------------------------------------
// Lógica de instalación
// ---------------------------------------------------------------------------------------------

static class Installer
{
    const string Releases = "https://github.com/PoxiiTV/Eliminao/releases/latest/download/";
    const string VencordCli = "https://github.com/Vencord/Installer/releases/latest/download/VencordInstallerCli.exe";
    static readonly string[] Files = { "patcher.js", "preload.js", "renderer.js", "renderer.css" };
    static readonly string[] Branches = { "Discord", "DiscordPTB", "DiscordCanary" };
    static readonly string LocalAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

    // Vencord espera los archivos en <dir>\dist; Discord cargará <dir>\dist\patcher.js
    public static readonly string AppDir = Path.Combine(LocalAppData, "Eliminao", "app");
    static readonly string DistDir = Path.Combine(AppDir, "dist");
    static readonly string CliPath = Path.Combine(AppDir, "VencordInstallerCli.exe");

    public const int InstallSteps = 6;

    public static DirectoryInfo[] DiscordRoots()
    {
        return Branches
            .Select(b => new DirectoryInfo(Path.Combine(LocalAppData, b)))
            .Where(d => d.Exists && LatestApp(d) != null)
            .ToArray();
    }

    static DirectoryInfo LatestApp(DirectoryInfo root)
    {
        return root.GetDirectories("app-*")
            .Where(d => File.Exists(Path.Combine(d.FullName, "resources", "app.asar")))
            .OrderByDescending(d => ParseVersion(d.Name.Substring(4)))
            .FirstOrDefault();
    }

    static Version ParseVersion(string s)
    {
        Version v;
        return Version.TryParse(s, out v) ? v : new Version(0, 0);
    }

    /// Ruta del patcher que carga ese Discord, o null si no tiene Vencord.
    /// Parcheado = un app.asar diminuto que hace require() del patcher.
    static string LoadedFrom(DirectoryInfo root)
    {
        var asar = new FileInfo(Path.Combine(LatestApp(root).FullName, "resources", "app.asar"));
        if (asar.Length > 10 * 1024) return null;
        var text = File.ReadAllText(asar.FullName).Replace("\\\\", "\\");
        var m = Regex.Match(text, "require\\(\"(.+?)\"\\)");
        return m.Success ? m.Groups[1].Value : null;
    }

    static bool LoadsEliminao(DirectoryInfo root)
    {
        var target = LoadedFrom(root);
        return target != null && target.StartsWith(DistDir + "\\", StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsInstalled()
    {
        return DiscordRoots().Any(LoadsEliminao);
    }

    public static string InstalledVersion()
    {
        var file = Path.Combine(AppDir, "version.json");
        if (!File.Exists(file)) return null;
        var m = Regex.Match(File.ReadAllText(file), "\"version\"\\s*:\\s*\"(.+?)\"");
        return m.Success ? m.Groups[1].Value : null;
    }

    public static void Install(Action<int, string> step)
    {
        step(1, "Descargando Eliminao…");
        Directory.CreateDirectory(AppDir);
        var tmp = DistDir + ".tmp";
        if (Directory.Exists(tmp)) Directory.Delete(tmp, true);
        Directory.CreateDirectory(tmp);
        foreach (var f in Files) Download(Releases + f, Path.Combine(tmp, f));
        Download(Releases + "version.json", Path.Combine(tmp, "version.json"));
        if (!File.ReadAllText(Path.Combine(tmp, "renderer.js")).Contains("Eliminao"))
            throw new Exception("El archivo descargado no contiene Eliminao. Vuelve a intentarlo en unos minutos.");

        // Todo descargado: ahora sí se sustituye la versión anterior
        if (Directory.Exists(DistDir)) Directory.Delete(DistDir, true);
        File.Move(Path.Combine(tmp, "version.json"), Path.Combine(AppDir, "version.json.new"));
        Directory.Move(tmp, DistDir);
        ReplaceFile(Path.Combine(AppDir, "version.json.new"), Path.Combine(AppDir, "version.json"));

        step(2, "Descargando el instalador de Vencord…");
        Download(VencordCli, CliPath);

        step(3, "Cerrando Discord…");
        KillDiscord();

        step(4, "Instalando en Discord…");
        RunCli("-install -branch auto");

        step(5, "Comprobando que Discord carga Eliminao…");
        var root = DiscordRoots().FirstOrDefault(LoadsEliminao);
        if (root == null)
            throw new Exception("Discord no carga Eliminao después de instalarlo. Prueba a abrir el instalador con clic derecho → Ejecutar como administrador.");

        step(6, "Abriendo Discord…");
        Launch(root);
    }

    public static void Uninstall(Action<int, string> step)
    {
        step(1, "Cerrando Discord…");
        KillDiscord();

        step(2, "Quitando Eliminao de Discord…");
        if (!File.Exists(CliPath)) Download(VencordCli, CliPath);
        RunCli("-uninstall -branch auto");
        if (IsInstalled()) throw new Exception("No se pudo quitar Eliminao de Discord.");

        step(3, "Borrando archivos…");
        try { Directory.Delete(AppDir, true); }
        catch (IOException) { } // si algo queda bloqueado, no impide la desinstalación

        var root = DiscordRoots().FirstOrDefault();
        if (root != null) Launch(root);
    }

    static void Download(string url, string path)
    {
        using (var wc = new WebClient())
        {
            wc.CachePolicy = new RequestCachePolicy(RequestCacheLevel.NoCacheNoStore);
            wc.Headers[HttpRequestHeader.UserAgent] = "Eliminao-Instalador";
            try { wc.DownloadFile(url, path); }
            catch (WebException e)
            {
                var http = e.Response as HttpWebResponse;
                if (http != null && http.StatusCode == HttpStatusCode.NotFound)
                    throw new Exception("Todavía no hay ninguna versión publicada en GitHub. Vuelve a intentarlo más tarde.");
                throw new Exception("No se pudo descargar " + Path.GetFileName(path) + ". Comprueba tu conexión a internet y vuelve a intentarlo.");
            }
        }
    }

    static void ReplaceFile(string from, string to)
    {
        if (File.Exists(to)) File.Delete(to);
        File.Move(from, to);
    }

    static void KillDiscord()
    {
        foreach (var name in Branches)
            foreach (var p in Process.GetProcessesByName(name))
            {
                try { p.Kill(); p.WaitForExit(5000); }
                catch (Exception) { } // ya cerrado o sin permiso: el instalador de Vencord lo avisará
            }
    }

    static void RunCli(string args)
    {
        var psi = new ProcessStartInfo(CliPath, args)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
        };
        // Modo "dev" del instalador oficial: parchea Discord para que cargue nuestra carpeta
        psi.EnvironmentVariables["VENCORD_USER_DATA_DIR"] = AppDir;
        psi.EnvironmentVariables["VENCORD_DEV_INSTALL"] = "1";

        using (var p = Process.Start(psi))
        {
            var errors = new StringBuilder();
            p.ErrorDataReceived += (s, e) => { if (e.Data != null) errors.AppendLine(e.Data); };
            p.BeginErrorReadLine();
            var output = p.StandardOutput.ReadToEnd();
            if (!p.WaitForExit(120000))
            {
                p.Kill();
                throw new Exception("El instalador de Vencord no ha respondido.");
            }
            if (p.ExitCode != 0)
                throw new Exception("El instalador de Vencord ha fallado:\n" + LastLines(output + errors, 2));
        }
    }

    static string LastLines(string text, int n)
    {
        var lines = Regex.Replace(text, "\x1b\\[[0-9;]*m", "").Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0).ToArray();
        return string.Join("\n", lines.Skip(Math.Max(0, lines.Length - n)));
    }

    static void Launch(DirectoryInfo root)
    {
        var update = Path.Combine(root.FullName, "Update.exe");
        if (File.Exists(update)) Process.Start(update, "--processStart " + root.Name + ".exe");
    }
}

// ---------------------------------------------------------------------------------------------
// Interfaz
// ---------------------------------------------------------------------------------------------

static class Palette
{
    public static readonly Color Background = Color.FromArgb(30, 31, 34);
    public static readonly Color Surface = Color.FromArgb(43, 45, 49);
    public static readonly Color Text = Color.FromArgb(242, 243, 245);
    public static readonly Color Muted = Color.FromArgb(148, 155, 164);
    public static readonly Color Accent = Color.FromArgb(88, 101, 242);
    public static readonly Color AccentHover = Color.FromArgb(71, 82, 196);
    public static readonly Color Success = Color.FromArgb(35, 165, 90);
    public static readonly Color Danger = Color.FromArgb(242, 63, 67);
}

enum Badge { Clock, Spinner, Success, Error }

/// Icono grande del estado: reloj, spinner girando, check o cruz
class StatusBadge : Control
{
    Badge kind = Badge.Clock;
    float angle;
    readonly Timer spin = new Timer { Interval = 16 };

    public StatusBadge()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.SupportsTransparentBackColor, true);
        BackColor = Color.Transparent;
        spin.Tick += (s, e) => { angle = (angle + 6) % 360; Invalidate(); };
    }

    public Badge Kind
    {
        get { return kind; }
        set { kind = value; spin.Enabled = value == Badge.Spinner; Invalidate(); }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        float s = Math.Min(Width, Height), pad = s * 0.04f, stroke = s * 0.085f;
        var box = new RectangleF(pad, pad, s - 2 * pad, s - 2 * pad);
        var c = new PointF(s / 2, s / 2);

        if (kind == Badge.Spinner)
        {
            using (var track = new Pen(Color.FromArgb(60, Palette.Accent), stroke))
            using (var arc = new Pen(Palette.Accent, stroke) { StartCap = LineCap.Round, EndCap = LineCap.Round })
            {
                var r = RectangleF.Inflate(box, -stroke / 2, -stroke / 2);
                g.DrawEllipse(track, r);
                g.DrawArc(arc, r, angle, 100);
            }
            return;
        }

        var fill = kind == Badge.Success ? Palette.Success : kind == Badge.Error ? Palette.Danger : Palette.Accent;
        using (var b = new SolidBrush(fill)) g.FillEllipse(b, box);
        using (var pen = new Pen(Color.White, stroke) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round })
        {
            if (kind == Badge.Clock)
            {
                g.DrawLine(pen, c, new PointF(c.X, s * 0.27f));
                g.DrawLine(pen, c, new PointF(s * 0.68f, s * 0.68f));
            }
            else if (kind == Badge.Success)
            {
                g.DrawLines(pen, new[] { new PointF(s * 0.3f, s * 0.52f), new PointF(s * 0.44f, s * 0.66f), new PointF(s * 0.71f, s * 0.38f) });
            }
            else
            {
                g.DrawLine(pen, s * 0.36f, s * 0.36f, s * 0.64f, s * 0.64f);
                g.DrawLine(pen, s * 0.64f, s * 0.36f, s * 0.36f, s * 0.64f);
            }
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) spin.Dispose();
        base.Dispose(disposing);
    }
}

/// Barra de progreso fina y redondeada que avanza con suavidad hasta el valor pedido
class SlimProgress : Control
{
    float value, target;
    readonly Timer ease = new Timer { Interval = 16 };

    public SlimProgress()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
        ease.Tick += (s, e) =>
        {
            value += (target - value) * 0.18f;
            if (Math.Abs(target - value) < 0.002f) { value = target; ease.Stop(); }
            Invalidate();
        };
    }

    public float Target
    {
        set { target = Math.Max(0, Math.Min(1, value)); ease.Start(); }
    }

    public void Reset() { value = target = 0; Invalidate(); }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Palette.Background);
        using (var track = new SolidBrush(Palette.Surface)) FillPill(g, track, new RectangleF(0, 0, Width, Height));
        if (value > 0)
            using (var fill = new SolidBrush(Palette.Accent)) FillPill(g, fill, new RectangleF(0, 0, Math.Max(Height, Width * value), Height));
    }

    static void FillPill(Graphics g, Brush b, RectangleF r)
    {
        using (var path = new GraphicsPath())
        {
            float d = r.Height;
            path.AddArc(r.X, r.Y, d, d, 90, 180);
            path.AddArc(r.Right - d, r.Y, d, d, 270, 180);
            path.CloseFigure();
            g.FillPath(b, path);
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) ease.Dispose();
        base.Dispose(disposing);
    }
}

class InstallerForm : Form
{
    readonly StatusBadge badge = new StatusBadge();
    readonly Label title = new Label();
    readonly Label status = new Label();
    readonly SlimProgress progress = new SlimProgress();
    readonly Button primary = MakeButton(true);
    readonly Button secondary = MakeButton(false);
    Action primaryAction, secondaryAction;

    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    public InstallerForm()
    {
        Text = "Eliminao";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(440, 320);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Palette.Background;
        Font = new Font("Segoe UI", 10F);

        badge.SetBounds(188, 28, 64, 64);

        title.SetBounds(20, 104, 400, 36);
        title.Font = new Font("Segoe UI Semibold", 16F);
        title.ForeColor = Palette.Text;
        title.TextAlign = ContentAlignment.MiddleCenter;

        status.SetBounds(30, 142, 380, 74);
        status.AutoEllipsis = true; // si aun así no cabe: "…" y el texto entero en el tooltip
        status.ForeColor = Palette.Muted;
        status.TextAlign = ContentAlignment.TopCenter;

        progress.SetBounds(70, 228, 300, 6);

        // Roles explícitos: sin ellos, Windows (y los lectores de pantalla) ven todo como un panel genérico
        badge.AccessibleRole = AccessibleRole.Graphic;
        title.AccessibleRole = AccessibleRole.StaticText;
        status.AccessibleRole = AccessibleRole.StaticText;
        progress.AccessibleRole = AccessibleRole.ProgressBar;
        progress.AccessibleName = "Progreso";

        primary.Click += (s, e) => { if (primaryAction != null) primaryAction(); };
        secondary.Click += (s, e) => { if (secondaryAction != null) secondaryAction(); };

        Controls.AddRange(new Control[] { badge, title, status, progress, primary, secondary });
        Shown += (s, e) => Start();
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        // Barra de título oscura en Windows 10/11 (attr 20; 19 en builds antiguas de Windows 10)
        int on = 1;
        if (DwmSetWindowAttribute(Handle, 20, ref on, 4) != 0) DwmSetWindowAttribute(Handle, 19, ref on, 4);
    }

    /// Botón plano sin el recuadro de foco punteado de Windows (no pega con el diseño)
    class FlatButton : Button
    {
        protected override bool ShowFocusCues { get { return false; } }
        // Tampoco el borde de "botón por defecto" que Windows añade al estilo plano
        public override void NotifyDefault(bool value) { base.NotifyDefault(false); }
    }

    static Button MakeButton(bool isPrimary)
    {
        var b = new FlatButton
        {
            FlatStyle = FlatStyle.Flat,
            BackColor = isPrimary ? Palette.Accent : Palette.Surface,
            ForeColor = Color.White,
            Font = new Font("Segoe UI Semibold", 10F),
            Cursor = Cursors.Hand,
            Visible = false,
            AccessibleRole = AccessibleRole.PushButton,
        };
        b.FlatAppearance.BorderSize = 0;
        b.FlatAppearance.MouseOverBackColor = isPrimary ? Palette.AccentHover : Color.FromArgb(53, 55, 60);
        b.FlatAppearance.MouseDownBackColor = isPrimary ? Palette.AccentHover : Color.FromArgb(53, 55, 60);
        return b;
    }

    // ---- Estados ----

    void Start()
    {
        if (Installer.DiscordRoots().Length == 0)
        {
            SetState(Badge.Error, "No encuentro Discord", "Instala Discord de escritorio y vuelve a abrir este instalador.",
                "Descargar Discord", () => Process.Start("https://discord.com/download"), "Cerrar", Close);
            return;
        }

        if (Installer.IsInstalled())
        {
            var version = Installer.InstalledVersion();
            SetState(Badge.Clock, "Eliminao ya está instalado",
                (version != null ? "Tienes la versión " + version + ". " : "") + "¿Qué quieres hacer?",
                "Actualizar / reparar", () => Run(false), "Desinstalar", ConfirmUninstall);
            return;
        }

        Run(false);
    }

    void ConfirmUninstall()
    {
        var answer = MessageBox.Show(this, "Se quitará Eliminao (y Vencord) de Discord. Tus mensajes programados dejarán de borrarse.\n\n¿Desinstalar?",
            "Eliminao", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
        if (answer == DialogResult.Yes) Run(true);
    }

    async void Run(bool uninstall)
    {
        int total = uninstall ? 3 : Installer.InstallSteps;
        progress.Reset();
        SetState(Badge.Spinner, uninstall ? "Desinstalando…" : "Instalando Eliminao…", "Preparando…", null, null, null, null);

        Action<int, string> step = (n, text) => BeginInvoke((Action)(() =>
        {
            status.Text = text;
            progress.Target = (n - 0.5f) / total;
        }));

        try
        {
            await Task.Run(() => { if (uninstall) Installer.Uninstall(step); else Installer.Install(step); });
            progress.Target = 1;
            if (uninstall)
                SetState(Badge.Success, "Eliminao desinstalado", "Discord vuelve a estar como antes.", "Cerrar", Close, null, null);
            else
                SetState(Badge.Success, "¡Instalado!", "Discord se está abriendo. Busca el reloj en la barra del chat.", "Cerrar", Close, null, null);
        }
        catch (Exception e)
        {
            SetState(Badge.Error, uninstall ? "No se pudo desinstalar" : "No se pudo instalar", e.Message,
                "Reintentar", () => Run(uninstall), "Cerrar", Close);
        }
    }

    void SetState(Badge kind, string heading, string detail, string primaryText, Action onPrimary, string secondaryText, Action onSecondary)
    {
        badge.Kind = kind;
        badge.AccessibleName = heading;
        title.Text = heading;
        status.Text = detail;
        progress.Visible = kind == Badge.Spinner;

        primaryAction = onPrimary;
        secondaryAction = onSecondary;
        primary.Text = primaryText ?? "";
        secondary.Text = secondaryText ?? "";
        primary.Visible = primaryText != null;
        secondary.Visible = secondaryText != null;

        // Uno centrado, o dos juntos centrados (el principal a la derecha)
        int w = Px(170), h = Px(38), gap = Px(10), y = Px(256), cx = ClientSize.Width / 2;
        if (secondary.Visible)
        {
            secondary.SetBounds(cx - gap / 2 - w, y, w, h);
            primary.SetBounds(cx + gap / 2, y, w, h);
        }
        else primary.SetBounds(cx - w / 2, y, w, h);
        if (primary.Visible) primary.Focus();
    }

    int Px(int px)
    {
        return (int)Math.Round(px * DeviceDpi / 96.0);
    }
}
