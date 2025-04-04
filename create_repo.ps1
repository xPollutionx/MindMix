$ErrorActionPreference = "Stop"

# GitHub repository details
$repoName = "MindMix"
$repoDescription = "Binaural Beat Audio Processor"
$private = $false

# Create repository on GitHub
Write-Host "Creating repository $repoName on GitHub..."

# Set up Git to use Git Credential Manager
git config --global credential.helper manager

# Create a new repository on GitHub
$url = "https://api.github.com/user/repos"
$body = @{
    name = $repoName
    description = $repoDescription
    private = $private
    auto_init = $false
} | ConvertTo-Json

try {
    # This will prompt for GitHub credentials using Git Credential Manager
    $creds = git credential fill | Out-String
    $username = ($creds -split "`n" | Select-String "username=").ToString() -replace "username=", ""
    $password = ($creds -split "`n" | Select-String "password=").ToString() -replace "password=", ""
    
    $base64AuthInfo = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(("{0}:{1}" -f $username, $password)))
    $headers = @{
        Authorization = "Basic $base64AuthInfo"
        Accept = "application/vnd.github.v3+json"
    }
    
    Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body -ContentType "application/json"
    
    Write-Host "Repository created successfully!"
    
    # Push the local repository to GitHub
    Write-Host "Pushing local repository to GitHub..."
    git remote remove origin
    git remote add origin "https://github.com/$username/$repoName.git"
    git push -u origin main
    
    Write-Host "Repository published successfully at: https://github.com/$username/$repoName"
} 
catch {
    Write-Host "Error: $_"
} 