param([Parameter(Mandatory=$true)][string]$OutputFile)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$seismoSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $seismoFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $seismoSynth.SetOutputToWaveFile($OutputFile, $seismoFormat)
    $seismoSynth.Speak('Show all earthquakes deeper than three hundred kilometers during the last seventy two hours. Explain the evidence for this forecast.')
} finally { $seismoSynth.Dispose() }
