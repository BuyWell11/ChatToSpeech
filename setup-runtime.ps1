param(
    [string]$ToolsDirectory,
    [string]$EnvironmentDirectory,
    [string]$EngineDirectory,
    [ValidateSet('rhvoice', 'rvc')]
    [string]$Mode = 'rvc'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$clientDirectory = $PSScriptRoot
$toolsDirectory = if ($ToolsDirectory) { $ToolsDirectory } else { Join-Path $clientDirectory 'tools' }
$environmentDirectory = if ($EnvironmentDirectory) {
    $EnvironmentDirectory
} else {
    Join-Path $clientDirectory 'env'
}
$engineDirectory = if ($EngineDirectory) {
    $EngineDirectory
} else {
    Join-Path $clientDirectory 'engine'
}
$requirementsFile = if ($Mode -eq 'rhvoice') {
    Join-Path $clientDirectory 'requirements-rhvoice.txt'
} else {
    Join-Path $clientDirectory 'requirements-local.txt'
}
$manifestPath = Join-Path $environmentDirectory 'runtime-manifest.json'
$condaDirectory = Join-Path $toolsDirectory 'miniconda'
$condaBatch = Join-Path $condaDirectory 'condabin\conda.bat'
$python = Join-Path $environmentDirectory 'python.exe'
$applioCommit = '2614ccdf56ed6672755576f767988f7a20a956a5'
$applioAssetsRevision = '3ff370b7023086f57e200ef86a9a251ddf4da472'
$engineInfer = Join-Path $engineDirectory 'rvc\infer\infer.py'

function Write-SetupProgress {
    param([string]$Phase, [Nullable[int]]$Percent)

    $value = if ($null -eq $Percent) { '' } else { [string]$Percent }
    Write-Output "PROGRESS|$Phase|$value"
}

Write-SetupProgress -Phase 'Preparing directories' -Percent 2
if ($Mode -eq 'rvc' -and -not (Test-Path $engineInfer)) {
    $downloadDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "govorilka-applio-$([guid]::NewGuid())"
    $archive = Join-Path $downloadDirectory 'applio.zip'
    $extractDirectory = Join-Path $downloadDirectory 'extract'
    try {
        New-Item -ItemType Directory -Force -Path $downloadDirectory | Out-Null
        Write-Host "Downloading the Applio RVC engine (commit $applioCommit)..."
        Write-SetupProgress -Phase 'Downloading RVC engine' -Percent $null
        Invoke-WebRequest -Uri "https://github.com/IAHispano/Applio/archive/$applioCommit.zip" -OutFile $archive
        Write-SetupProgress -Phase 'Extracting RVC engine' -Percent $null
        Expand-Archive -LiteralPath $archive -DestinationPath $extractDirectory

        $sourceRoot = Get-ChildItem -LiteralPath $extractDirectory -Directory | Select-Object -First 1
        if (-not $sourceRoot) {
            throw 'The downloaded Applio archive is empty.'
        }
        $sourceInfer = Join-Path $sourceRoot.FullName 'rvc\infer\infer.py'
        if (-not (Test-Path $sourceInfer)) {
            throw 'The downloaded Applio archive does not contain the expected RVC inference engine.'
        }

        New-Item -ItemType Directory -Force -Path $engineDirectory | Out-Null
        Copy-Item -LiteralPath (Join-Path $sourceRoot.FullName 'rvc') -Destination (Join-Path $engineDirectory 'rvc') -Recurse -Force
        Copy-Item -LiteralPath (Join-Path $sourceRoot.FullName 'LICENSE') -Destination (Join-Path $engineDirectory 'LICENSE') -Force
        if (-not (Test-Path $engineInfer)) {
            throw 'The Applio RVC inference engine was not installed correctly.'
        }
    }
    finally {
        if (Test-Path -LiteralPath $downloadDirectory) {
            Remove-Item -LiteralPath $downloadDirectory -Recurse -Force
        }
    }
}

New-Item -ItemType Directory -Force -Path $toolsDirectory | Out-Null

if (-not (Test-Path $condaBatch)) {
    $installer = Join-Path $env:TEMP 'govorilka-miniconda-installer.exe'
    $installerUrl = 'https://repo.anaconda.com/miniconda/Miniconda3-py312_24.11.1-0-Windows-x86_64.exe'
    try {
        Write-Host 'Downloading private Miniconda bootstrap...'
        Write-SetupProgress -Phase 'Downloading Python installer' -Percent $null
        Invoke-WebRequest -Uri $installerUrl -OutFile $installer
        $installerArguments = "/S /InstallationType=JustMe /RegisterPython=0 /AddToPath=0 /D=$condaDirectory"
        $installerProcess = Start-Process -FilePath $installer -ArgumentList $installerArguments -Wait -PassThru
        if ($installerProcess.ExitCode -ne 0) {
            throw "Miniconda installer exited with code $($installerProcess.ExitCode)."
        }
        if (-not (Test-Path $condaBatch)) {
            throw 'Miniconda installer completed without creating conda.bat.'
        }
    }
    finally {
        if (Test-Path -LiteralPath $installer) {
            Remove-Item -LiteralPath $installer -Force
        }
    }
}

if (-not (Test-Path $python)) {
    Write-Host 'Creating the client-local Python 3.12 environment...'
    Write-SetupProgress -Phase 'Creating Python environment' -Percent $null
    & $condaBatch create --yes --prefix $environmentDirectory python=3.12
    if ($LASTEXITCODE -ne 0) {
        throw "Conda environment creation failed with exit code $LASTEXITCODE."
    }
}

Write-Host 'Updating pip...'
Write-SetupProgress -Phase 'Preparing Python' -Percent 12
& $python -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
    throw "pip update failed with exit code $LASTEXITCODE."
}

if ($Mode -eq 'rvc') {
    Write-Host 'Installing CUDA-enabled PyTorch...'
    Write-SetupProgress -Phase 'Installing PyTorch and CUDA' -Percent 20
    & $python -m pip install torch==2.7.1+cu128 torchaudio==2.7.1+cu128 --extra-index-url https://download.pytorch.org/whl/cu128
    if ($LASTEXITCODE -ne 0) {
        throw "PyTorch installation failed with exit code $LASTEXITCODE."
    }
}

Write-Host "Installing $Mode speech dependencies..."
if ($Mode -eq 'rvc') {
    $dependencyPhase = 'Installing RVC and RHVoice dependencies'
} else {
    $dependencyPhase = 'Installing RHVoice'
}
Write-SetupProgress -Phase $dependencyPhase -Percent 40
& $python -m pip install --disable-pip-version-check -r $requirementsFile
if ($LASTEXITCODE -ne 0) {
    throw "Speech dependency installation failed with exit code $LASTEXITCODE."
}

if ($Mode -eq 'rvc') {
$requiredAssets = @(
    @{
        Path = 'rvc\models\predictors\rmvpe.pt'
        UrlPath = 'predictors/rmvpe.pt'
        Size = 181184272
        Sha256 = '6D62215F4306E3CA278246188607209F09AF3DC77ED4232EFDD069798C4EC193'
    },
    @{
        Path = 'rvc\models\predictors\fcpe.pt'
        UrlPath = 'predictors/fcpe.pt'
        Size = 43362881
        Sha256 = '8544427EEBBF2BAEF6213CC9A05057E46961617A8E5BD96975A0D42DA6A09059'
    },
    @{
        Path = 'rvc\models\embedders\contentvec\config.json'
        UrlPath = 'embedders/contentvec/config.json'
        Size = 1388
        Sha256 = '2DDDE063B795D38D9051A7215A092FECF4CFE148B54251E38DE51D88D356898B'
    },
    @{
        Path = 'rvc\models\embedders\contentvec\pytorch_model.bin'
        UrlPath = 'embedders/contentvec/pytorch_model.bin'
        Size = 378342945
        Sha256 = 'D8DD400E054DDF4E6BE75DAB5A2549DB748CC99E756A097C496C099F65A4854E'
    },
    @{
        Path = 'ffmpeg.exe'
        UrlPath = 'ffmpeg.exe'
        Size = 52925440
        Sha256 = 'B6A4D917A444790F4C06ADA640C1C0C95AECDE2F8953ED8D0DFB19352500BFCD'
    },
    @{
        Path = 'ffprobe.exe'
        UrlPath = 'ffprobe.exe'
        Size = 122135040
        Sha256 = '2DA5B980A9A14A808F423D181C4ED51C2B8AF11B1366699F3F7EAB0609926F8F'
    }
)

function Test-AssetFile {
    param([string]$Path, [hashtable]$Asset)

    if (-not (Test-Path -LiteralPath $Path) -or (Get-Item -LiteralPath $Path).Length -ne $Asset.Size) {
        return $false
    }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -eq $Asset.Sha256
}

foreach ($asset in $requiredAssets) {
    $assetPath = Join-Path $engineDirectory $asset.Path
    if (-not (Test-AssetFile -Path $assetPath -Asset $asset)) {
        if (Test-Path -LiteralPath $assetPath) {
            Remove-Item -LiteralPath $assetPath -Force
        }
        $assetDirectory = Split-Path -Parent $assetPath
        New-Item -ItemType Directory -Force -Path $assetDirectory | Out-Null
        $partialPath = "$assetPath.download"
        try {
            Write-Host "Downloading RVC prerequisite: $($asset.Path)..."
            Write-SetupProgress -Phase "Downloading model $($asset.Path)" -Percent $null
            Invoke-WebRequest -UseBasicParsing -Uri "https://huggingface.co/IAHispano/Applio/resolve/$applioAssetsRevision/Resources/$($asset.UrlPath)" -OutFile $partialPath
            if (-not (Test-AssetFile -Path $partialPath -Asset $asset)) {
                throw "Downloaded RVC prerequisite failed its size or SHA-256 check: $($asset.Path)."
            }
            Move-Item -LiteralPath $partialPath -Destination $assetPath -Force
        }
        finally {
            if (Test-Path -LiteralPath $partialPath) {
                Remove-Item -LiteralPath $partialPath -Force
            }
        }
    }
}
}

Write-Host 'Checking the local speech installation...'
Write-SetupProgress -Phase 'Validating speech synthesis' -Percent 85
if ($Mode -eq 'rvc') {
    & $python -c "import torch; from rhvoice_wrapper import TTS; assert torch.cuda.is_available(), 'CUDA is unavailable'; tts=TTS(threads=1, quiet=True); audio=tts.get('test', voice='anna', format_='wav'); assert len(audio)>44, 'RHVoice did not synthesize audio'; tts.join(); print('PyTorch CUDA:', torch.__version__, torch.cuda.get_device_name(0)); print('RHVoice WAV bytes:', len(audio))"
} else {
    & $python -c "from rhvoice_wrapper import TTS; tts=TTS(threads=1, quiet=True); audio=tts.get('test', voice='anna', format_='wav'); assert len(audio)>44, 'RHVoice did not synthesize audio'; tts.join(); print('RHVoice WAV bytes:', len(audio))"
}
if ($LASTEXITCODE -ne 0) {
    throw "Local runtime validation failed with exit code $LASTEXITCODE."
}

@{ mode = $Mode; version = 1 } | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-SetupProgress -Phase 'Installation complete' -Percent 100
