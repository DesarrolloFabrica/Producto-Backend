# E2E API local — flujo completo desde cero (sin UI)
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3000'
$report = @()

function Log($step, $name, $ok, $detail) {
  $script:report += [pscustomobject]@{ Step = $step; Test = $name; OK = $ok; Detail = $detail }
  $icon = if ($ok) { 'OK' } else { 'FAIL' }
  Write-Host "[$icon] $step - $name : $detail"
}

function Login($email, $password) {
  $body = @{ email = $email; password = $password } | ConvertTo-Json
  return (Invoke-RestMethod -Uri "$base/auth/login" -Method Post -Body $body -ContentType 'application/json').accessToken
}

function Headers($token) { @{ Authorization = "Bearer $token" } }

# Invoke-RestMethod puede fusionar arrays JSON en un solo PSCustomObject (id como array).
function Get-NotificationsList($token) {
  $raw = (Invoke-WebRequest -Uri "$base/notifications" -Headers (Headers $token)).Content | ConvertFrom-Json
  if ($null -eq $raw) { return @() }
  if ($raw -is [System.Array]) { return $raw }
  if ($raw.id -is [System.Array]) {
    $list = @()
    for ($i = 0; $i -lt $raw.id.Count; $i++) {
      $list += [pscustomobject]@{
        id         = $raw.id[$i]
        userId     = if ($raw.userId -is [System.Array]) { $raw.userId[$i] } else { $raw.userId }
        roleTarget = if ($raw.roleTarget -is [System.Array]) { $raw.roleTarget[$i] } else { $raw.roleTarget }
        isRead     = if ($raw.isRead -is [System.Array]) { $raw.isRead[$i] } else { $raw.isRead }
      }
    }
    return $list
  }
  return @($raw)
}

function Set-ChecklistFab($id, $token) {
  foreach ($st in @('EN_PRODUCCION', 'ENTREGADO')) {
    $b = @{ status = $st } | ConvertTo-Json
    Invoke-RestMethod -Uri "$base/checklist/$id/status" -Method Patch -Headers (Headers $token) -Body $b -ContentType 'application/json' | Out-Null
  }
}

try {
  $h = Invoke-RestMethod -Uri "$base/health"
  Log '0' 'GET /health' ($h.status -eq 'ok') ($h | ConvertTo-Json -Compress)

  $pt = Login 'product@local' 'Product123!'
  $ft = Login 'fabrica@local' 'Fabrica123!'
  Log '0' 'Auth login' $true 'product + fabrica'

  $body = @{
    school = 'Escuela de Ingeniería'
    program = 'Prueba Desde Cero'
    modality = 'VIRTUAL'
    requestType = 'Virtualización piloto'
    priority = 'MEDIUM'
    expectedDeliveryDate = '2026-12-31T00:00:00.000Z'
    semesters = @(@{
      semesterNumber = 1
      factoryExpectedDate = '2026-08-01T00:00:00.000Z'
      subjects = @(@{ name = 'Asignatura Piloto'; topics = @('Tema A', 'Tema B') })
    })
  } | ConvertTo-Json -Depth 10

  $created = Invoke-RestMethod -Uri "$base/projects" -Method Post -Headers (Headers $pt) -Body $body -ContentType 'application/json'
  $projectId = $created.id
  $subjectId = $created.semesters[0].subjects[0].id
  Log 'A' 'POST /projects' ([bool]$projectId) "id=$projectId"

  $detail = Invoke-RestMethod -Uri "$base/projects/$projectId" -Headers (Headers $pt)
  $chkIds = @()
  foreach ($sem in $detail.semesters) {
    foreach ($sub in $sem.subjects) {
      $chkIds += $sub.checklist | ForEach-Object { $_.id }
      foreach ($top in $sub.topics) { $chkIds += $top.checklist | ForEach-Object { $_.id } }
    }
  }
  $chkIds = $chkIds | Select-Object -Unique
  Log 'A' 'GET /projects/:id estructura' ($chkIds.Count -ge 16) "checklist=$($chkIds.Count) topics=$($detail.semesters[0].subjects[0].topics.Count)"

  foreach ($cid in $chkIds) { Set-ChecklistFab $cid $ft }
  $sub = Invoke-RestMethod -Uri "$base/subjects/$subjectId/submit" -Method Post -Headers (Headers $ft)
  Log 'C' 'POST submit' ($sub.subjectStatus -eq 'IN_REVIEW') $sub.subjectStatus

  $obsBody = @{
    projectId = $projectId
    subjectId = $subjectId
    relatedEntityType = 'SUBJECT'
    relatedEntityId = $subjectId
    text = 'Observación prueba desde cero'
    priority = 'MEDIUM'
  } | ConvertTo-Json
  $obs = Invoke-RestMethod -Uri "$base/observations" -Method Post -Headers (Headers $pt) -Body $obsBody -ContentType 'application/json'
  try {
    Invoke-RestMethod -Uri "$base/subjects/$subjectId/approve" -Method Post -Headers (Headers $pt) | Out-Null
    Log 'D' 'approve con obs ABIERTA' $false 'debía fallar'
  } catch { Log 'D' 'approve bloqueado' $true $_.ErrorDetails.Message }

  $m = Invoke-RestMethod -Uri "$base/observations/$($obs.id)/mark-correction-applied" -Method Post -Headers (Headers $ft)
  Log 'E' 'mark-correction' ($m.currentStatus -eq 'EN_CORRECCION') $m.currentStatus
  $v = Invoke-RestMethod -Uri "$base/observations/$($obs.id)/validate" -Method Post -Headers (Headers $pt)
  Log 'F' 'validate' ($v.currentStatus -eq 'RESUELTA') $v.currentStatus

  $detail2 = Invoke-RestMethod -Uri "$base/projects/$projectId" -Headers (Headers $pt)
  $entregados = @()
  foreach ($sem in $detail2.semesters) {
    foreach ($sub in $sem.subjects) {
      $entregados += $sub.checklist | Where-Object { $_.status -eq 'ENTREGADO' }
      foreach ($top in $sub.topics) {
        $entregados += $top.checklist | Where-Object { $_.status -eq 'ENTREGADO' }
      }
    }
  }
  $entregados = $entregados | Sort-Object -Property id -Unique
  $approveFails = 0
  foreach ($item in $entregados) {
    $b = @{ status = 'APROBADO' } | ConvertTo-Json
    try {
      Invoke-RestMethod -Uri "$base/checklist/$($item.id)/status" -Method Patch -Headers (Headers $pt) -Body $b -ContentType 'application/json' | Out-Null
    } catch {
      $approveFails++
    }
  }
  Log 'F' 'PATCH checklist APROBADO' ($approveFails -eq 0) "fallos=$approveFails de $($entregados.Count) ENTREGADO"
  $ap = Invoke-RestMethod -Uri "$base/subjects/$subjectId/approve" -Method Post -Headers (Headers $pt)
  Log 'F' 'approve subject' ($ap.subjectStatus -eq 'APPROVED') $ap.subjectStatus

  $del = Invoke-RestMethod -Uri "$base/projects/$projectId/mark-delivered" -Method Post -Headers (Headers $pt)
  Log 'H' 'mark-delivered' ($del.projectStatus -eq 'DELIVERED_TO_LMS') $del.projectStatus
  $cls = Invoke-RestMethod -Uri "$base/projects/$projectId/close" -Method Post -Headers (Headers $pt)
  Log 'H' 'close project' ($cls.projectStatus -eq 'CLOSED') $cls.projectStatus

  $notifs = Get-NotificationsList $pt
  Log 'G' 'GET /notifications' ($notifs.Count -gt 0) "count=$($notifs.Count)"
  $readable = $notifs | Where-Object { $_.id -match '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' } | Select-Object -First 1
  if ($readable) {
    try {
      Invoke-RestMethod -Uri "$base/notifications/$($readable.id)/read" -Method Patch -Headers (Headers $pt) | Out-Null
      Invoke-RestMethod -Uri "$base/notifications/read-all" -Method Patch -Headers (Headers $pt) | Out-Null
      Log 'G' 'PATCH read notifications' $true 'ok'
    } catch {
      Log 'G' 'PATCH read notifications' $false $_.ErrorDetails.Message
    }
  } else {
    Log 'G' 'PATCH read notifications' $false 'sin notificación accesible para PRODUCT'
  }
} catch {
  Log 'ERR' 'Excepción' $false $_.Exception.Message
}

$report | Format-Table -AutoSize
$fail = @($report | Where-Object { -not $_.OK }).Count
Write-Host "`nTotal: $($report.Count) | Fallos: $fail"
exit $(if ($fail -gt 0) { 1 } else { 0 })
