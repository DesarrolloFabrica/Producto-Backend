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
  $r = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -Body $body -ContentType 'application/json'
  return $r.accessToken
}

function Headers($token) {
  return @{ Authorization = "Bearer $token" }
}

function Set-ChecklistFabEntregado($id, $token) {
  foreach ($status in @('EN_PRODUCCION', 'ENTREGADO')) {
    $b = @{ status = $status } | ConvertTo-Json
    Invoke-RestMethod -Uri "$base/checklist/$id/status" -Method Patch -Headers (Headers $token) -Body $b -ContentType 'application/json' | Out-Null
  }
}

try {
  # PASO 3
  $health = Invoke-RestMethod -Uri "$base/health" -Method Get
  Log '3' 'GET /health' ($health.status -eq 'ok' -and $health.service -eq 'producto-backend') ($health | ConvertTo-Json -Compress)

  # PASO 4
  $adminToken = Login 'admin@local' 'Admin123!'
  $productToken = Login 'product@local' 'Product123!'
  $fabricaToken = Login 'fabrica@local' 'Fabrica123!'
  Log '4' 'POST /auth/login (3 roles)' $true 'tokens obtenidos'

  $meAdmin = Invoke-RestMethod -Uri "$base/auth/me" -Headers (Headers $adminToken)
  Log '4' 'GET /auth/me (ADMIN)' ($meAdmin.email -eq 'admin@local') $meAdmin.email

  # PASO 5
  $usersAdmin = Invoke-RestMethod -Uri "$base/users" -Headers (Headers $adminToken)
  Log '5' 'GET /users (ADMIN)' ($usersAdmin.Count -ge 3) "count=$($usersAdmin.Count)"

  try {
    Invoke-RestMethod -Uri "$base/users" -Headers (Headers $productToken) | Out-Null
    Log '5' 'GET /users (PRODUCT 403)' $false 'esperaba 403'
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    Log '5' 'GET /users (PRODUCT 403)' ($code -eq 403) "status=$code"
  }

  $profile = Invoke-RestMethod -Uri "$base/users/me/profile" -Headers (Headers $productToken)
  Log '5' 'GET /users/me/profile (PRODUCT)' ($profile.email -eq 'product@local') $profile.email

  # PASO 6
  $projectBody = @{
    school = 'Escuela de Ingeniería'
    program = 'Ingeniería de Software'
    modality = 'VIRTUAL'
    requestType = 'Virtualización'
    priority = 'MEDIUM'
    expectedDeliveryDate = '2026-12-31T00:00:00.000Z'
    observations = 'Proyecto piloto local'
    syllabus = @{ hasSyllabus = $true; url = 'https://example.com/syllabus.pdf' }
    semesters = @(
      @{
        semesterNumber = 1
        factoryExpectedDate = '2026-08-01T00:00:00.000Z'
        subjects = @(
          @{
            name = 'Matemáticas I'
            topics = @('Introducción', 'Álgebra básica')
          }
        )
      }
    )
  } | ConvertTo-Json -Depth 10

  $created = Invoke-RestMethod -Uri "$base/projects" -Method Post -Headers (Headers $productToken) -Body $projectBody -ContentType 'application/json'
  $projectId = $created.id
  Log '6' 'POST /projects' ([bool]$projectId) "id=$projectId"

  $list = Invoke-RestMethod -Uri "$base/projects" -Headers (Headers $productToken)
  Log '6' 'GET /projects' ($list.Count -ge 1) "count=$($list.Count)"

  $detail = Invoke-RestMethod -Uri "$base/projects/$projectId" -Headers (Headers $productToken)
  $subject = $detail.semesters[0].subjects[0]
  $topic = $subject.topics[0]
  $subjectChecklist = $subject.checklist.Count
  $topicChecklist = $topic.checklist.Count
  Log '6' 'GET /projects/:id estructura' (
    $detail.id -and $subjectChecklist -gt 0 -and $topicChecklist -gt 0
  ) "subjectChecklist=$subjectChecklist topicChecklist=$topicChecklist"

  $subjectId = $subject.id
  $allChecklistIds = @()
  foreach ($s in $detail.semesters) {
    foreach ($sub in $s.subjects) {
      $allChecklistIds += $sub.checklist | ForEach-Object { $_.id }
      foreach ($t in $sub.topics) {
        $allChecklistIds += $t.checklist | ForEach-Object { $_.id }
      }
    }
  }

  # PASO 7 - primer item FABRICA
  $firstItemId = $allChecklistIds[0]
  $patchBody = @{ status = 'EN_PRODUCCION' } | ConvertTo-Json
  $p1 = Invoke-RestMethod -Uri "$base/checklist/$firstItemId/status" -Method Patch -Headers (Headers $fabricaToken) -Body $patchBody -ContentType 'application/json'
  $patchBody2 = @{ status = 'ENTREGADO' } | ConvertTo-Json
  $p2 = Invoke-RestMethod -Uri "$base/checklist/$firstItemId/status" -Method Patch -Headers (Headers $fabricaToken) -Body $patchBody2 -ContentType 'application/json'
  $after7 = Invoke-RestMethod -Uri "$base/projects/$projectId" -Headers (Headers $fabricaToken)
  $sub7 = $after7.semesters[0].subjects[0]
  Log '7' 'PATCH checklist FABRICA' (
    $p2.checklistStatus -eq 'ENTREGADO' -and $sub7.progress -ge 0
  ) "item=$($p2.checklistStatus) progress=$($sub7.progress)"

  # PASO 8 - marcar todos ENTREGADO y submit
  foreach ($cid in $allChecklistIds) {
    Set-ChecklistFabEntregado $cid $fabricaToken
  }
  $submit = Invoke-RestMethod -Uri "$base/subjects/$subjectId/submit" -Method Post -Headers (Headers $fabricaToken)
  Log '8' 'POST /subjects/:id/submit' ($submit.subjectStatus -eq 'IN_REVIEW') "subject=$($submit.subjectStatus) project=$($submit.projectStatus)"

  # PASO 9
  $obsBody = @{
    projectId = $projectId
    subjectId = $subjectId
    relatedEntityType = 'SUBJECT'
    relatedEntityId = $subjectId
    text = 'Falta ajustar la bibliografía.'
    priority = 'MEDIUM'
  } | ConvertTo-Json
  $obs = Invoke-RestMethod -Uri "$base/observations" -Method Post -Headers (Headers $productToken) -Body $obsBody -ContentType 'application/json'
  $obsList = @(Invoke-RestMethod -Uri "$base/projects/$projectId/observations" -Headers (Headers $productToken))
  $abierta = @($obsList | Where-Object { $_.status -eq 'ABIERTA' }).Count -ge 1
  Log '9' 'POST/GET observations' $abierta "obsId=$($obs.id)"

  try {
    Invoke-RestMethod -Uri "$base/subjects/$subjectId/approve" -Method Post -Headers (Headers $productToken) | Out-Null
    Log '9' 'POST approve con obs ABIERTA' $false 'debía fallar'
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    Log '9' 'POST approve con obs ABIERTA' ($code -eq 400 -or $code -eq 403 -or $code -eq 409) "status=$code"
  }

  # PASO 10
  $mark = Invoke-RestMethod -Uri "$base/observations/$($obs.id)/mark-correction-applied" -Method Post -Headers (Headers $fabricaToken)
  Log '10' 'mark-correction-applied' ($mark.currentStatus -eq 'EN_CORRECCION') $mark.currentStatus
  $val = Invoke-RestMethod -Uri "$base/observations/$($obs.id)/validate" -Method Post -Headers (Headers $productToken)
  Log '10' 'validate observation' ($val.currentStatus -eq 'RESUELTA') $val.currentStatus

  # PASO 11 - aprobar checklist y subject (PRODUCT: ENTREGADO -> APROBADO)
  foreach ($cid in $allChecklistIds) {
    $b = @{ status = 'APROBADO' } | ConvertTo-Json
    try {
      Invoke-RestMethod -Uri "$base/checklist/$cid/status" -Method Patch -Headers (Headers $productToken) -Body $b -ContentType 'application/json' | Out-Null
    } catch {
      # ya APROBADO
    }
  }
  $approved = Invoke-RestMethod -Uri "$base/subjects/$subjectId/approve" -Method Post -Headers (Headers $productToken)
  Log '11' 'POST /subjects/:id/approve' ($approved.subjectStatus -eq 'APPROVED') $approved.subjectStatus

  # PASO 12
  $delivered = Invoke-RestMethod -Uri "$base/projects/$projectId/mark-delivered" -Method Post -Headers (Headers $productToken)
  $closed = Invoke-RestMethod -Uri "$base/projects/$projectId/close" -Method Post -Headers (Headers $productToken)
  Log '12' 'mark-delivered + close' ($closed.projectStatus -eq 'CLOSED') "final=$($closed.projectStatus)"

  # PASO 13
  $notifs = Invoke-RestMethod -Uri "$base/notifications" -Headers (Headers $productToken)
  Log '13' 'GET /notifications' ($notifs.Count -ge 0) "count=$($notifs.Count)"

} catch {
  Log 'ERR' 'Excepción general' $false $_.Exception.Message
}

$report | Format-Table -AutoSize
$report | ConvertTo-Json -Depth 3 | Out-File -FilePath "$PSScriptRoot\validate-report.json" -Encoding utf8
