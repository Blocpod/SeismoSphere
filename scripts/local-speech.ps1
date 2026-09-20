param([ValidateSet('status','transcribe')][string]$Mode = 'status')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
    Add-Type -AssemblyName System.Speech
    $speechRecognizers = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers())
    if ($Mode -eq 'status') {
        @{ available = ($speechRecognizers.Count -gt 0); provider = 'Windows offline speech'; recognizers = @($speechRecognizers | ForEach-Object { @{ id = $_.Id; language = $_.Culture.Name; name = $_.Name } }) } | ConvertTo-Json -Depth 5 -Compress
        exit 0
    }
    $speechRequest = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $speechInfo = $speechRecognizers | Where-Object { $_.Culture.Name -eq $speechRequest.language } | Select-Object -First 1
    if (-not $speechInfo) { throw 'The selected offline speech language is not installed on this PC.' }
    $speechAudio = [Convert]::FromBase64String($speechRequest.audio)
    $speechStream = New-Object System.IO.MemoryStream(,$speechAudio)
    $speechRecognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine($speechInfo.Id)
    try {
        $speechRecognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
        $speechRecognizer.SetInputToWaveStream($speechStream)
        $null = Register-ObjectEvent -InputObject $speechRecognizer -EventName SpeechRecognized -SourceIdentifier SeismoSpeechRecognized
        $null = Register-ObjectEvent -InputObject $speechRecognizer -EventName RecognizeCompleted -SourceIdentifier SeismoSpeechCompleted
        $speechSegments = @()
        $speechRecognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
        while ($true) {
            $speechEvent = Wait-Event -Timeout 35
            if (-not $speechEvent) { throw 'Local speech recognition did not complete in time.' }
            Remove-Event -EventIdentifier $speechEvent.EventIdentifier
            if ($speechEvent.SourceIdentifier -eq 'SeismoSpeechRecognized') { $speechSegments += @{ text = $speechEvent.SourceEventArgs.Result.Text } }
            if ($speechEvent.SourceIdentifier -eq 'SeismoSpeechCompleted') {
                if ($speechEvent.SourceEventArgs.Error) { throw $speechEvent.SourceEventArgs.Error }
                if ($speechEvent.SourceEventArgs.Cancelled) { throw 'Local speech recognition was cancelled.' }
                break
            }
        }
        @{ text = [string]::Join(' ', @($speechSegments | ForEach-Object { $_.text })); segments = $speechSegments; language = $speechInfo.Culture.Name; model = $speechInfo.Name; provider = 'Windows offline speech' } | ConvertTo-Json -Depth 5 -Compress
    } finally {
        Unregister-Event -SourceIdentifier SeismoSpeechRecognized -ErrorAction SilentlyContinue
        Unregister-Event -SourceIdentifier SeismoSpeechCompleted -ErrorAction SilentlyContinue
        $speechRecognizer.Dispose()
        $speechStream.Dispose()
    }
} catch {
    @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
    exit 1
}
