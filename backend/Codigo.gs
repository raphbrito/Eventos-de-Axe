/**
 * Eventos de Axé — backend completo para Google Apps Script.
 * Arquivo consolidado a partir dos módulos em backend/apps-script.
 */

// ===== backend\apps-script\config\Constants.gs =====
const APP_CONFIG = {
  API_VERSION: 'v1',
  SPREADSHEET_ID_PROPERTY: 'EVENTOS_DE_AXE_SPREADSHEET_ID',
  FRONTEND_URL_PROPERTY: 'EVENTOS_DE_AXE_FRONTEND_URL',
  INVITE_ADMIN_EMAILS_PROPERTY: 'EVENTOS_DE_AXE_ADMIN_EMAILS',
  EMAIL_QUEUE_PROPERTY: 'EVENTOS_DE_AXE_EMAIL_QUEUE',
  EMAIL_QUEUE_HANDLER: 'processEmailQueue',
  EMAIL_REMINDER_HANDLER: 'processRegistrationEmailReminders',
  SESSION_CACHE_TTL_SECONDS: 300,
  SESSION_TTL_MS: 60 * 60 * 1000,
  TOKEN_TTL_MS: {
    CONFIRMACAO_CADASTRO: 24 * 60 * 60 * 1000,
    ALTERACAO_EMAIL: 30 * 60 * 1000,
    RECUPERACAO_SENHA: 30 * 60 * 1000
  },
  SHEETS: {
    USERS: 'Usuarios', VALIDATIONS: 'Validacoes', SESSIONS: 'Sessoes', INVITES: 'Convites', EVENTS: 'Eventos', EVENT_ACCESS: 'AcessosEvento', LOGS: 'Logs'
  },
  HEADERS: {
    Usuarios: ['id_usuario', 'nome', 'sobrenome', 'email', 'email_confirmado_em', 'senha_hash', 'status', 'criado_em', 'ultimo_login_em'],
    Validacoes: ['id_validacao', 'id_usuario', 'tipo', 'valor', 'token', 'status', 'criado_em', 'expira_em', 'utilizado_em', 'lembrete_enviado_em'],
    Sessoes: ['id_sessao', 'id_usuario', 'token', 'status', 'criado_em', 'ultimo_acesso_em', 'expira_em', 'encerrado_em'],
    Convites: ['id_convite', 'email', 'token', 'status', 'criado_em', 'expira_em', 'utilizado_em', 'criado_por', 'id_evento'],
    Eventos: ['id_evento', 'slug', 'nome', 'planilha_rsvp_id', 'aba_rsvp', 'status', 'criado_em'],
    AcessosEvento: ['id_acesso', 'id_evento', 'id_usuario', 'papel', 'criado_em'],
    Logs: ['id_log', 'id_usuario', 'evento', 'descricao', 'criado_em']
  }
};

const USER_STATUS = { PENDING: 'PENDENTE', ACTIVE: 'ATIVO' };
const VALIDATION_STATUS = { PENDING: 'PENDENTE', USED: 'UTILIZADO', EXPIRED: 'EXPIRADO', REPLACED: 'SUBSTITUIDO' };
const SESSION_STATUS = { ACTIVE: 'ATIVA', EXPIRED: 'EXPIRADA', CLOSED: 'ENCERRADA' };
const VALIDATION_TYPE = { REGISTRATION: 'CONFIRMACAO_CADASTRO', EMAIL_CHANGE: 'ALTERACAO_EMAIL', PASSWORD_RESET: 'RECUPERACAO_SENHA' };
const INVITE_STATUS = { PENDING: 'PENDENTE', USED: 'UTILIZADO', EXPIRED: 'EXPIRADO', REPLACED: 'SUBSTITUIDO' };
var REQUEST_CONTEXT = null;


// ===== backend\apps-script\utils\ResponseUtils.gs =====
function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function success(message, data, status) {
  return { success: true, message: message, data: data || {}, status: status || 200 };
}

function failure(message, code, status) {
  return { success: false, message: message, error: { code: code }, status: status || 400 };
}

function toApiResponse(result) {
  // Apps Script ContentService cannot set an HTTP status; status is kept in the JSON contract.
  delete result.status;
  return jsonResponse(result);
}


// ===== backend\apps-script\utils\ValidationUtils.gs =====
function requireFields(payload, fields) {
  fields.forEach(function (field) {
    if (payload[field] === undefined || payload[field] === null || String(payload[field]).trim() === '') {
      throw apiError('O campo ' + field + ' é obrigatório.', 'REQUIRED_FIELD', 400);
    }
  });
}

function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }
function validateEmail(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))) throw apiError('E-mail inválido.', 'INVALID_EMAIL', 400);
}
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw apiError('A senha deve ter ao menos 8 caracteres, com letra maiuscula, minuscula e numero.', 'WEAK_PASSWORD', 400);
  }
}
function apiError(message, code, status) { return { isApiError: true, message: message, code: code, status: status || 400 }; }


// ===== backend\apps-script\database\Spreadsheet.gs =====
function getSpreadsheet() {
  if (REQUEST_CONTEXT && REQUEST_CONTEXT.spreadsheet) return REQUEST_CONTEXT.spreadsheet;
  var id = PropertiesService.getScriptProperties().getProperty(APP_CONFIG.SPREADSHEET_ID_PROPERTY);
  if (!id) throw apiError('Banco de dados não configurado.', 'CONFIGURATION_ERROR', 500);
  var spreadsheet = SpreadsheetApp.openById(id);
  if (REQUEST_CONTEXT) REQUEST_CONTEXT.spreadsheet = spreadsheet;
  return spreadsheet;
}

function beginRequestContext() {
  REQUEST_CONTEXT = { spreadsheet: null, rows: {} };
}

function initializeDatabase() {
  var spreadsheet = getSpreadsheet();
  Object.keys(APP_CONFIG.HEADERS).forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
    var headers = APP_CONFIG.HEADERS[name];
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      return;
    }
    var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    headers.forEach(function (header) {
      if (existingHeaders.indexOf(header) === -1) {
        sheet.getRange(1, existingHeaders.length + 1).setValue(header);
        existingHeaders.push(header);
      }
    });
  });
}

function configureEventosDeAxe(spreadsheetId, frontendUrl) {
  var properties = PropertiesService.getScriptProperties();
  spreadsheetId = spreadsheetId || properties.getProperty(APP_CONFIG.SPREADSHEET_ID_PROPERTY);
  frontendUrl = frontendUrl || properties.getProperty(APP_CONFIG.FRONTEND_URL_PROPERTY);
  if (!spreadsheetId || !frontendUrl) throw new Error('Informe o ID da planilha e a URL do frontend na primeira configuração.');
  properties.setProperties({
    EVENTOS_DE_AXE_SPREADSHEET_ID: spreadsheetId,
    EVENTOS_DE_AXE_FRONTEND_URL: frontendUrl.replace(/\/$/, '')
  });
  initializeDatabase();
  ensureConfirmationReminderTrigger();
}

function upgradeEventosDeAxe() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = properties.getProperty(APP_CONFIG.SPREADSHEET_ID_PROPERTY);
  var frontendUrl = properties.getProperty(APP_CONFIG.FRONTEND_URL_PROPERTY);
  if (!spreadsheetId || !frontendUrl) throw new Error('A instalação ainda não foi configurada. Execute configureEventosDeAxe(ID_DA_PLANILHA, URL_DO_FRONTEND) pelo editor de código.');
  configureEventosDeAxe(spreadsheetId, frontendUrl);
}

function configureInviteAdmins(emails) {
  var normalized = String(emails || '').split(',').map(normalizeEmail).filter(function (email) { return !!email; });
  if (!normalized.length) throw new Error('Informe ao menos um e-mail administrador.');
  PropertiesService.getScriptProperties().setProperty(APP_CONFIG.INVITE_ADMIN_EMAILS_PROPERTY, normalized.join(','));
}

// Uso único: preencha os dados abaixo no editor Apps Script, execute esta função
// uma vez e remova a senha do código antes de publicar uma nova versão.
function bootstrapInitialGlobalAdmin() {
  var initial = {
    nome: 'COLE_SEU_NOME',
    sobrenome: 'COLE_SEU_SOBRENOME',
    email: 'COLE_SEU_EMAIL',
    senha: 'COLE_UMA_SENHA_FORTE'
  };
  if (Object.keys(initial).some(function (key) { return initial[key].indexOf('COLE_') === 0; })) {
    throw new Error('Preencha os dados da primeira administradora em bootstrapInitialGlobalAdmin antes de executar.');
  }
  beginRequestContext();
  if (sheetRows(APP_CONFIG.SHEETS.USERS).length) throw new Error('Já existe uma conta. O bootstrap só pode ser executado em uma instalação nova.');
  validateEmail(initial.email); validatePassword(initial.senha);
  var user = { id_usuario: generateId(), nome: initial.nome.trim(), sobrenome: initial.sobrenome.trim(), email: normalizeEmail(initial.email), email_confirmado_em: new Date(), senha_hash: hashPassword(initial.senha), status: USER_STATUS.ACTIVE, criado_em: new Date(), ultimo_login_em: '' };
  insertRow(APP_CONFIG.SHEETS.USERS, user);
  configureInviteAdmins(user.email);
  logEvent('ADMIN_GLOBAL_INICIAL_CRIADO', user.id_usuario, 'Primeira administradora criada.');
  return 'Administradora inicial criada: ' + user.email;
}


// ===== backend\apps-script\repositories\Repository.gs =====
function sheetRows(sheetName) {
  if (REQUEST_CONTEXT && REQUEST_CONTEXT.rows[sheetName]) return REQUEST_CONTEXT.rows[sheetName];
  var sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw apiError('Aba não encontrada.', 'DATABASE_ERROR', 500);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = values.slice(1).map(function (row, index) {
    var item = { _row: index + 2 };
    headers.forEach(function (header, col) { item[header] = row[col]; });
    return item;
  });
  if (REQUEST_CONTEXT) REQUEST_CONTEXT.rows[sheetName] = rows;
  return rows;
}

function findRow(sheetName, predicate) { return sheetRows(sheetName).find(predicate) || null; }
function insertRow(sheetName, item) {
  var sheet = getSpreadsheet().getSheetByName(sheetName);
  var headers = APP_CONFIG.HEADERS[sheetName];
  sheet.appendRow(headers.map(function (header) { return item[header] === undefined ? '' : item[header]; }));
  if (REQUEST_CONTEXT) delete REQUEST_CONTEXT.rows[sheetName];
  return item;
}
function updateRow(sheetName, rowNumber, changes) {
  var sheet = getSpreadsheet().getSheetByName(sheetName), headers = APP_CONFIG.HEADERS[sheetName];
  var record = sheetRows(sheetName).find(function (item) { return item._row === rowNumber; });
  if (!record) throw apiError('Registro nao encontrado.', 'DATABASE_ERROR', 500);
  Object.keys(changes).forEach(function (key) { if (headers.indexOf(key) !== -1) record[key] = changes[key]; });
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([headers.map(function (header) { return record[header] === undefined ? '' : record[header]; })]);
}
function deleteRow(sheetName, rowNumber) {
  getSpreadsheet().getSheetByName(sheetName).deleteRow(rowNumber);
  if (REQUEST_CONTEXT) delete REQUEST_CONTEXT.rows[sheetName];
}


// ===== backend\apps-script\services\TokenService.gs =====
function generateRandomToken() {
  return [Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid()].join('').replace(/-/g, '');
}
function generateId() { return Utilities.getUuid(); }

function hashValue(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return bytes.map(function (byte) { var n = byte < 0 ? byte + 256 : byte; return ('0' + n.toString(16)).slice(-2); }).join('');
}


// ===== backend\apps-script\services\PasswordService.gs =====
function hashPassword(password) {
  var salt = generateRandomToken();
  return salt + ':' + hashValue(salt + ':' + password);
}
function verifyPassword(password, storedHash) {
  var parts = String(storedHash || '').split(':');
  if (parts.length !== 2) return false;
  var expected = hashValue(parts[0] + ':' + password), actual = parts[1];
  if (expected.length !== actual.length) return false;
  var mismatch = 0;
  for (var i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  return mismatch === 0;
}


// ===== backend\apps-script\services\LogService.gs =====
function logEvent(event, userId, description) {
  insertRow(APP_CONFIG.SHEETS.LOGS, {
    id_log: generateId(), id_usuario: userId || '', evento: event, descricao: description || '', criado_em: new Date()
  });
}


// ===== backend\apps-script\services\EmailService.gs =====
function deliverValidationEmail(validation, user, isReminder) {
  var baseUrl = PropertiesService.getScriptProperties().getProperty(APP_CONFIG.FRONTEND_URL_PROPERTY);
  if (!baseUrl) throw apiError('URL do frontend não configurada.', 'CONFIGURATION_ERROR', 500);
  var isRegistration = validation.tipo === VALIDATION_TYPE.REGISTRATION;
  var view = isRegistration ? 'verify' : validation.tipo === VALIDATION_TYPE.PASSWORD_RESET ? 'reset' : 'confirm-email';
  var link = baseUrl + '/?view=' + view + '&token=' + encodeURIComponent(validation.token);
  var subject = isReminder ? 'Lembrete: confirme seu cadastro em Eventos de Axé' : isRegistration ? 'Confirme seu cadastro em Eventos de Axé' : validation.tipo === VALIDATION_TYPE.PASSWORD_RESET ? 'Redefinição de senha' : 'Confirme seu novo e-mail';
  var reminderText = isReminder ? '<p>Seu cadastro ainda está aguardando a confirmação do e-mail.</p>' : '';
  MailApp.sendEmail({ to: validation.valor || user.email, subject: subject, htmlBody: '<p>Olá, ' + user.nome + '.</p>' + reminderText + '<p><a href="' + link + '">Clique aqui para continuar</a>.</p><p>Este link expira em ' + validation.expira_em + '.</p>' });
}

function sendRegistrationInviteEmail(invite) {
  var baseUrl = PropertiesService.getScriptProperties().getProperty(APP_CONFIG.FRONTEND_URL_PROPERTY);
  if (!baseUrl) throw apiError('URL do frontend nao configurada.', 'CONFIGURATION_ERROR', 500);
  var link = baseUrl + '/?view=invite&token=' + encodeURIComponent(invite.token);
  MailApp.sendEmail({ to: invite.email, subject: 'Convite para criar seu acesso em Eventos de Axé', htmlBody: '<p>Você recebeu um convite para criar seu acesso.</p><p><a href="' + link + '">Criar minha senha</a></p><p>Este link pode ser usado uma única vez e expira em ' + invite.expira_em + '.</p>' });
}


function sendValidationEmail(validation, user) {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var properties = PropertiesService.getScriptProperties();
    var queue = JSON.parse(properties.getProperty(APP_CONFIG.EMAIL_QUEUE_PROPERTY) || '[]');
    if (queue.indexOf(validation.id_validacao) === -1) queue.push(validation.id_validacao);
    properties.setProperty(APP_CONFIG.EMAIL_QUEUE_PROPERTY, JSON.stringify(queue));
    var hasTrigger = ScriptApp.getProjectTriggers().some(function (trigger) { return trigger.getHandlerFunction() === APP_CONFIG.EMAIL_QUEUE_HANDLER; });
    if (!hasTrigger) ScriptApp.newTrigger(APP_CONFIG.EMAIL_QUEUE_HANDLER).timeBased().after(1000).create();
  } finally {
    lock.releaseLock();
  }
}

function processEmailQueue() {
  beginRequestContext();
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  var queue;
  try {
    var properties = PropertiesService.getScriptProperties();
    queue = JSON.parse(properties.getProperty(APP_CONFIG.EMAIL_QUEUE_PROPERTY) || '[]');
    properties.deleteProperty(APP_CONFIG.EMAIL_QUEUE_PROPERTY);
    ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === APP_CONFIG.EMAIL_QUEUE_HANDLER; }).forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });
  } finally {
    lock.releaseLock();
  }
  queue.forEach(function (validationId) {
    try {
      var validation = findRow(APP_CONFIG.SHEETS.VALIDATIONS, function (item) { return item.id_validacao === validationId; });
      if (!validation || validation.status !== VALIDATION_STATUS.PENDING || new Date(validation.expira_em).getTime() <= Date.now()) return;
      var user = getUserById(validation.id_usuario);
      if (!user) return;
      deliverValidationEmail(validation, user);
      logEvent('EMAIL_ENVIADO', user.id_usuario, 'Validation e-mail sent.');
    } catch (error) {
      logEvent('EMAIL_FALHOU', '', 'Queue processing failed: ' + error.message);
    }
  });
}


function ensureConfirmationReminderTrigger() {
  var hasTrigger = ScriptApp.getProjectTriggers().some(function (trigger) { return trigger.getHandlerFunction() === APP_CONFIG.EMAIL_REMINDER_HANDLER; });
  if (!hasTrigger) ScriptApp.newTrigger(APP_CONFIG.EMAIL_REMINDER_HANDLER).timeBased().everyHours(1).create();
}

function processRegistrationEmailReminders() {
  beginRequestContext();
  var now = Date.now();
  var reminderAfterMs = APP_CONFIG.TOKEN_TTL_MS[VALIDATION_TYPE.REGISTRATION] / 2;
  sheetRows(APP_CONFIG.SHEETS.VALIDATIONS).filter(function (validation) {
    var createdAt = new Date(validation.criado_em).getTime();
    var expiresAt = new Date(validation.expira_em).getTime();
    return validation.tipo === VALIDATION_TYPE.REGISTRATION && validation.status === VALIDATION_STATUS.PENDING && !validation.lembrete_enviado_em && createdAt + reminderAfterMs <= now && expiresAt > now;
  }).forEach(function (validation) {
    try {
      var user = getUserById(validation.id_usuario);
      if (!user || user.status !== USER_STATUS.PENDING) return;
      deliverValidationEmail(validation, user, true);
      updateRow(APP_CONFIG.SHEETS.VALIDATIONS, validation._row, { lembrete_enviado_em: new Date() });
      logEvent('LEMBRETE_CONFIRMACAO_ENVIADO', user.id_usuario, 'Lembrete de confirmação de cadastro enviado.');
    } catch (error) {
      logEvent('LEMBRETE_CONFIRMACAO_FALHOU', '', 'Falha ao enviar lembrete: ' + error.message);
    }
  });
}

// ===== backend\apps-script\services\ValidationService.gs =====
function createValidation(user, type, value) {
  expirePendingValidations(user.id_usuario, type, VALIDATION_STATUS.REPLACED);
  var now = new Date();
  var validation = {
    id_validacao: generateId(), id_usuario: user.id_usuario, tipo: type, valor: value || '', token: generateRandomToken(),
    status: VALIDATION_STATUS.PENDING, criado_em: now, expira_em: new Date(now.getTime() + APP_CONFIG.TOKEN_TTL_MS[type]), utilizado_em: '', lembrete_enviado_em: ''
  };
  insertRow(APP_CONFIG.SHEETS.VALIDATIONS, validation);
  return validation;
}
function expirePendingValidations(userId, type, targetStatus) {
  sheetRows(APP_CONFIG.SHEETS.VALIDATIONS).filter(function (v) { return v.id_usuario === userId && v.tipo === type && v.status === VALIDATION_STATUS.PENDING; }).forEach(function (v) {
    updateRow(APP_CONFIG.SHEETS.VALIDATIONS, v._row, { status: targetStatus || VALIDATION_STATUS.EXPIRED });
  });
}
function getUsableValidation(token, type) {
  var validation = findRow(APP_CONFIG.SHEETS.VALIDATIONS, function (v) { return v.token === token && v.tipo === type; });
  if (!validation || validation.status !== VALIDATION_STATUS.PENDING) throw apiError('Token inválido ou já utilizado.', 'INVALID_TOKEN', 400);
  if (new Date(validation.expira_em).getTime() <= Date.now()) {
    updateRow(APP_CONFIG.SHEETS.VALIDATIONS, validation._row, { status: VALIDATION_STATUS.EXPIRED });
    throw apiError('Token expirado.', 'EXPIRED_TOKEN', 400);
  }
  return validation;
}
function consumeValidation(validation) { updateRow(APP_CONFIG.SHEETS.VALIDATIONS, validation._row, { status: VALIDATION_STATUS.USED, utilizado_em: new Date() }); }


// ===== backend\apps-script\services\SessionService.gs =====
function createSession(userId) {
  var now = new Date();
  var session = { id_sessao: generateId(), id_usuario: userId, token: generateRandomToken(), status: SESSION_STATUS.ACTIVE, criado_em: now, ultimo_acesso_em: now, expira_em: new Date(now.getTime() + APP_CONFIG.SESSION_TTL_MS), encerrado_em: '' };
  insertRow(APP_CONFIG.SHEETS.SESSIONS, session);
  return session;
}
function requireSession(token) {
  if (!token) throw apiError('Autenticação obrigatória.', 'UNAUTHORIZED', 401);
  var cached = CacheService.getScriptCache().get(sessionCacheKey(token));
  var session = cached ? JSON.parse(cached) : findRow(APP_CONFIG.SHEETS.SESSIONS, function (s) { return s.token === token; });
  if (session && !cached) cacheSession(session);
  if (!session || session.status !== SESSION_STATUS.ACTIVE) throw apiError('Sessão inválida.', 'UNAUTHORIZED', 401);
  if (new Date(session.expira_em).getTime() <= Date.now()) {
    updateRow(APP_CONFIG.SHEETS.SESSIONS, session._row, { status: SESSION_STATUS.EXPIRED });
    clearSessionCache(token);
    logEvent('SESSAO_EXPIRADA', session.id_usuario, 'Sessão expirada por inatividade.');
    throw apiError('Sessão expirada.', 'SESSION_EXPIRED', 401);
  }
  return session;
}
function sessionCacheKey(token) { return 'session:' + token; }
function cacheSession(session) { CacheService.getScriptCache().put(sessionCacheKey(session.token), JSON.stringify(session), APP_CONFIG.SESSION_CACHE_TTL_SECONDS); }
function clearSessionCache(token) { CacheService.getScriptCache().remove(sessionCacheKey(token)); }
function renewSession(session) {
  var now = new Date();
  updateRow(APP_CONFIG.SHEETS.SESSIONS, session._row, { ultimo_acesso_em: now, expira_em: new Date(now.getTime() + APP_CONFIG.SESSION_TTL_MS) });
  session.ultimo_acesso_em = now;
  session.expira_em = new Date(now.getTime() + APP_CONFIG.SESSION_TTL_MS);
  cacheSession(session);
}
function closeSession(token) {
  var session = requireSession(token);
  updateRow(APP_CONFIG.SHEETS.SESSIONS, session._row, { status: SESSION_STATUS.CLOSED, encerrado_em: new Date() });
  clearSessionCache(token);
  logEvent('LOGOUT', session.id_usuario, 'Logout realizado.');
}


// ===== backend\apps-script\services\AuthService.gs =====
function publicUser(user) { return { id: user.id_usuario, name: user.nome, lastName: user.sobrenome, email: user.email, status: user.status }; }
function getUserByEmail(email) { return findRow(APP_CONFIG.SHEETS.USERS, function (u) { return String(u.email).toLowerCase() === normalizeEmail(email); }); }
function getUserById(userId) { return findRow(APP_CONFIG.SHEETS.USERS, function (u) { return u.id_usuario === userId; }); }

function inviteAdminEmails() { return String(PropertiesService.getScriptProperties().getProperty(APP_CONFIG.INVITE_ADMIN_EMAILS_PROPERTY) || '').split(',').map(normalizeEmail).filter(function (email) { return !!email; }); }
function requireInviteAdmin(token) {
  var session = requireSession(token), user = getUserById(session.id_usuario);
  if (!user || inviteAdminEmails().indexOf(normalizeEmail(user.email)) === -1) throw apiError('Voce nao tem permissao para enviar convites.', 'FORBIDDEN', 403);
  return user;
}
function createRegistrationInvite(payload, token) {
  requireFields(payload, ['email']); validateEmail(payload.email);
  var admin = requireInviteAdmin(token), email = normalizeEmail(payload.email), now = new Date(), event = null;
  if (payload.eventSlug) {
    event = getEventBySlug(payload.eventSlug);
    if (!event) throw apiError('Evento nao encontrado.', 'EVENT_NOT_FOUND', 404);
  }
  var existingUser = getUserByEmail(email);
  if (existingUser) {
    if (!event) throw apiError('Este e-mail ja possui uma conta.', 'EMAIL_ALREADY_EXISTS', 409);
    if (!findRow(APP_CONFIG.SHEETS.EVENT_ACCESS, function (item) { return item.id_evento === event.id_evento && item.id_usuario === existingUser.id_usuario; })) {
      insertRow(APP_CONFIG.SHEETS.EVENT_ACCESS, { id_acesso: generateId(), id_evento: event.id_evento, id_usuario: existingUser.id_usuario, papel: 'ADMIN_EVENTO', criado_em: now });
    }
    return success('Esta conta ja existia; o acesso ao evento foi liberado.');
  }
  sheetRows(APP_CONFIG.SHEETS.INVITES).filter(function (invite) { return invite.email === email && invite.status === INVITE_STATUS.PENDING; }).forEach(function (invite) { updateRow(APP_CONFIG.SHEETS.INVITES, invite._row, { status: INVITE_STATUS.REPLACED }); });
  var invite = { id_convite: generateId(), email: email, token: generateRandomToken(), status: INVITE_STATUS.PENDING, criado_em: now, expira_em: new Date(now.getTime() + APP_CONFIG.TOKEN_TTL_MS[VALIDATION_TYPE.REGISTRATION]), utilizado_em: '', criado_por: admin.id_usuario, id_evento: event ? event.id_evento : '' };
  insertRow(APP_CONFIG.SHEETS.INVITES, invite); sendRegistrationInviteEmail(invite); logEvent('CONVITE_CADASTRO_ENVIADO', admin.id_usuario, 'Convite enviado para ' + email + '.');
  return success('Convite enviado para ' + email + '.');
}
function inviteGlobalAdmin(payload, token) {
  var requester = requireInviteAdmin(token), email = normalizeEmail(payload.email);
  validateEmail(email);
  var admins = inviteAdminEmails();
  if (admins.indexOf(email) === -1) {
    admins.push(email);
    PropertiesService.getScriptProperties().setProperty(APP_CONFIG.INVITE_ADMIN_EMAILS_PROPERTY, admins.join(','));
  }
  if (getUserByEmail(email)) {
    logEvent('ADMIN_GLOBAL_ATUALIZADO', requester.id_usuario, 'Acesso global liberado para ' + email + '.');
    return success('A conta existente agora possui acesso global.');
  }
  return createRegistrationInvite({ email: email }, token);
}
function getUsableRegistrationInvite(token) {
  var invite = findRow(APP_CONFIG.SHEETS.INVITES, function (item) { return item.token === token; });
  if (!invite || invite.status !== INVITE_STATUS.PENDING) throw apiError('Convite invalido ou ja utilizado.', 'INVALID_INVITE', 400);
  if (new Date(invite.expira_em).getTime() <= Date.now()) { updateRow(APP_CONFIG.SHEETS.INVITES, invite._row, { status: INVITE_STATUS.EXPIRED }); throw apiError('Convite expirado.', 'EXPIRED_INVITE', 400); }
  return invite;
}
function acceptRegistrationInvite(payload) {
  requireFields(payload, ['token', 'nome', 'sobrenome', 'senha', 'confirmarSenha']); validatePassword(payload.senha);
  if (payload.senha !== payload.confirmarSenha) throw apiError('As senhas nao coincidem.', 'PASSWORD_MISMATCH', 400);
  var invite = getUsableRegistrationInvite(payload.token);
  if (getUserByEmail(invite.email)) throw apiError('Este e-mail ja possui uma conta.', 'EMAIL_ALREADY_EXISTS', 409);
  var now = new Date(), user = { id_usuario: generateId(), nome: String(payload.nome).trim(), sobrenome: String(payload.sobrenome).trim(), email: invite.email, email_confirmado_em: now, senha_hash: hashPassword(payload.senha), status: USER_STATUS.ACTIVE, criado_em: now, ultimo_login_em: '' };
  insertRow(APP_CONFIG.SHEETS.USERS, user); updateRow(APP_CONFIG.SHEETS.INVITES, invite._row, { status: INVITE_STATUS.USED, utilizado_em: now });
  if (invite.id_evento && !findRow(APP_CONFIG.SHEETS.EVENT_ACCESS, function (item) { return item.id_evento === invite.id_evento && item.id_usuario === user.id_usuario; })) {
    insertRow(APP_CONFIG.SHEETS.EVENT_ACCESS, { id_acesso: generateId(), id_evento: invite.id_evento, id_usuario: user.id_usuario, papel: 'ADMIN_EVENTO', criado_em: now });
  }
  logEvent('CADASTRO_POR_CONVITE', user.id_usuario, 'Conta criada por convite.');
  return success('Cadastro concluido. Voce ja pode entrar.', { user: publicUser(user) }, 201);
}

function listUsersForAdmin(token) {
  requireInviteAdmin(token);
  return success('Usuarios carregados.', { users: sheetRows(APP_CONFIG.SHEETS.USERS).map(function (user) {
    return { id: user.id_usuario, name: user.nome, lastName: user.sobrenome, email: user.email, status: user.status, createdAt: user.criado_em, lastLoginAt: user.ultimo_login_em };
  }) });
}
function deleteUserForAdmin(payload, token) {
  requireFields(payload, ['userId']);
  var session = requireSession(token), target = getUserById(payload.userId);
  if (!target) throw apiError('Usuario nao encontrado.', 'USER_NOT_FOUND', 404);
  if (target.id_usuario === session.id_usuario) throw apiError('Voce nao pode excluir sua propria conta.', 'CANNOT_DELETE_SELF', 400);
  sheetRows(APP_CONFIG.SHEETS.SESSIONS).filter(function (item) { return item.id_usuario === target.id_usuario; }).sort(function (a, b) { return b._row - a._row; }).forEach(function (item) { clearSessionCache(item.token); deleteRow(APP_CONFIG.SHEETS.SESSIONS, item._row); });
  sheetRows(APP_CONFIG.SHEETS.VALIDATIONS).filter(function (item) { return item.id_usuario === target.id_usuario; }).sort(function (a, b) { return b._row - a._row; }).forEach(function (item) { deleteRow(APP_CONFIG.SHEETS.VALIDATIONS, item._row); });
  deleteRow(APP_CONFIG.SHEETS.USERS, target._row); logEvent('USUARIO_EXCLUIDO_POR_ADMIN', session.id_usuario, 'Conta removida: ' + target.email + '.');
  return success('Usuario excluido.');
}
function publicRegistrationDisabled() { throw apiError('Novas contas sao criadas somente por convite.', 'INVITE_REQUIRED', 403); }

function register(payload) {
  requireFields(payload, ['nome', 'sobrenome', 'email', 'senha', 'confirmarSenha']); validateEmail(payload.email); validatePassword(payload.senha);
  if (payload.senha !== payload.confirmarSenha) throw apiError('As senhas não coincidem.', 'PASSWORD_MISMATCH', 400);
  if (getUserByEmail(payload.email)) throw apiError('Este e-mail já está cadastrado.', 'EMAIL_ALREADY_EXISTS', 409);
  var now = new Date(), user = { id_usuario: generateId(), nome: String(payload.nome).trim(), sobrenome: String(payload.sobrenome).trim(), email: normalizeEmail(payload.email), email_confirmado_em: '', senha_hash: hashPassword(payload.senha), status: USER_STATUS.PENDING, criado_em: now, ultimo_login_em: '' };
  insertRow(APP_CONFIG.SHEETS.USERS, user);
  var validation = createValidation(user, VALIDATION_TYPE.REGISTRATION, user.email);
  logEvent('CADASTRO_REALIZADO', user.id_usuario, 'Usuário cadastrado.');
  try { sendValidationEmail(validation, user); } catch (error) { logEvent('EMAIL_FALHOU', user.id_usuario, 'Falha ao enviar confirmação: ' + error.message); }
  return success('Cadastro realizado. Confirme seu e-mail para acessar.', { user: publicUser(user) }, 201);
}
function confirmRegistration(token) {
  var validation = getUsableValidation(token, VALIDATION_TYPE.REGISTRATION), user = getUserById(validation.id_usuario);
  if (!user || user.status !== USER_STATUS.PENDING) throw apiError('Conta não disponível para confirmação.', 'INVALID_USER_STATE', 409);
  updateRow(APP_CONFIG.SHEETS.USERS, user._row, { status: USER_STATUS.ACTIVE, email_confirmado_em: new Date() }); consumeValidation(validation);
  logEvent('CADASTRO_CONFIRMADO', user.id_usuario, 'E-mail confirmado.'); return success('Cadastro confirmado. Você já pode entrar.');
}
function resendVerification(payload) {
  requireFields(payload, ['email']); var user = getUserByEmail(payload.email);
  if (!user) throw apiError('Não foi possível reenviar a confirmação.', 'USER_NOT_FOUND', 404);
  if (user.status !== USER_STATUS.PENDING) throw apiError('Esta conta já está confirmada.', 'USER_ALREADY_ACTIVE', 409);
  var validation = createValidation(user, VALIDATION_TYPE.REGISTRATION, user.email); sendValidationEmail(validation, user); logEvent('TOKEN_REENVIADO', user.id_usuario, 'Confirmação reenviada.');
  return success('Um novo e-mail de confirmação foi enviado.');
}
function login(payload) {
  requireFields(payload, ['email', 'senha']); var user = getUserByEmail(payload.email);
  if (!user || !verifyPassword(payload.senha, user.senha_hash)) { if (user) logEvent('LOGIN_FALHOU', user.id_usuario, 'Credenciais inválidas.'); throw apiError('E-mail ou senha inválidos.', 'INVALID_CREDENTIALS', 401); }
  if (user.status !== USER_STATUS.ACTIVE) throw apiError('Confirme seu e-mail antes de entrar.', 'EMAIL_NOT_CONFIRMED', 403);
  var session = createSession(user.id_usuario); updateRow(APP_CONFIG.SHEETS.USERS, user._row, { ultimo_login_em: new Date() }); logEvent('LOGIN', user.id_usuario, 'Login realizado.');
  return success('Login realizado com sucesso.', { token: session.token, user: publicUser(user) });
}


// ===== backend\apps-script\services\UserService.gs =====
function getProfile(token) {
  var session = requireSession(token), user = getUserById(session.id_usuario);
  if (!user) throw apiError('Usuário não encontrado.', 'USER_NOT_FOUND', 404);
  return success('Perfil carregado.', { user: publicUser(user) });
}
function updateProfile(token, payload) {
  var session = requireSession(token), user = getUserById(session.id_usuario), changes = {};
  if (payload.nome !== undefined) { if (!String(payload.nome).trim()) throw apiError('Nome inválido.', 'INVALID_NAME', 400); changes.nome = String(payload.nome).trim(); }
  if (payload.sobrenome !== undefined) { if (!String(payload.sobrenome).trim()) throw apiError('Sobrenome inválido.', 'INVALID_LAST_NAME', 400); changes.sobrenome = String(payload.sobrenome).trim(); }
  if (!Object.keys(changes).length) throw apiError('Nenhum campo permitido foi informado.', 'NO_UPDATES', 400);
  updateRow(APP_CONFIG.SHEETS.USERS, user._row, changes); Object.keys(changes).forEach(function (key) { user[key] = changes[key]; });
  logEvent('PERFIL_ATUALIZADO', user.id_usuario, 'Dados do perfil atualizados.'); return success('Perfil atualizado.', { user: publicUser(user) });
}
function requestEmailChange(token, payload) {
  var session = requireSession(token), user = getUserById(session.id_usuario); requireFields(payload, ['email', 'senha']); validateEmail(payload.email);
  var email = normalizeEmail(payload.email); if (!verifyPassword(payload.senha, user.senha_hash)) throw apiError('Senha atual inválida.', 'INVALID_CREDENTIALS', 401);
  if (getUserByEmail(email)) throw apiError('Este e-mail já está cadastrado.', 'EMAIL_ALREADY_EXISTS', 409);
  var validation = createValidation(user, VALIDATION_TYPE.EMAIL_CHANGE, email); sendValidationEmail(validation, user); logEvent('ALTERACAO_EMAIL_SOLICITADA', user.id_usuario, 'Alteração de e-mail solicitada.');
  return success('Enviamos uma confirmação para o novo e-mail.');
}
function confirmEmailChange(token) {
  var validation = getUsableValidation(token, VALIDATION_TYPE.EMAIL_CHANGE), user = getUserById(validation.id_usuario);
  if (getUserByEmail(validation.valor)) throw apiError('Este e-mail não está mais disponível.', 'EMAIL_ALREADY_EXISTS', 409);
  updateRow(APP_CONFIG.SHEETS.USERS, user._row, { email: validation.valor }); consumeValidation(validation); logEvent('EMAIL_ALTERADO', user.id_usuario, 'E-mail alterado após confirmação.');
  return success('E-mail alterado com sucesso.');
}
function changePassword(token, payload) {
  var session = requireSession(token), user = getUserById(session.id_usuario); requireFields(payload, ['senhaAtual', 'novaSenha', 'confirmarSenha']); validatePassword(payload.novaSenha);
  if (!verifyPassword(payload.senhaAtual, user.senha_hash)) throw apiError('Senha atual inválida.', 'INVALID_CREDENTIALS', 401);
  if (payload.novaSenha !== payload.confirmarSenha) throw apiError('As senhas não coincidem.', 'PASSWORD_MISMATCH', 400);
  updateRow(APP_CONFIG.SHEETS.USERS, user._row, { senha_hash: hashPassword(payload.novaSenha) }); logEvent('SENHA_ALTERADA', user.id_usuario, 'Senha alterada pelo usuário.');
  return success('Senha alterada com sucesso.');
}
function forgotPassword(payload) {
  requireFields(payload, ['email']); var user = getUserByEmail(payload.email);
  // Do not reveal whether the address exists.
  if (!user || user.status !== USER_STATUS.ACTIVE) return success('Se o e-mail estiver cadastrado, você receberá as instruções.');
  var validation = createValidation(user, VALIDATION_TYPE.PASSWORD_RESET, ''); sendValidationEmail(validation, user); logEvent('RECUPERACAO_SENHA', user.id_usuario, 'Recuperação de senha solicitada.');
  return success('Se o e-mail estiver cadastrado, você receberá as instruções.');
}
function resetPassword(payload) {
  requireFields(payload, ['token', 'novaSenha', 'confirmarSenha']); validatePassword(payload.novaSenha);
  if (payload.novaSenha !== payload.confirmarSenha) throw apiError('As senhas não coincidem.', 'PASSWORD_MISMATCH', 400);
  var validation = getUsableValidation(payload.token, VALIDATION_TYPE.PASSWORD_RESET), user = getUserById(validation.id_usuario);
  updateRow(APP_CONFIG.SHEETS.USERS, user._row, { senha_hash: hashPassword(payload.novaSenha) }); consumeValidation(validation); logEvent('SENHA_ALTERADA', user.id_usuario, 'Senha redefinida por recuperação.');
  return success('Senha redefinida com sucesso.');
}

// ===== Eventos de Axe =====
function isGlobalAdmin(token) { requireInviteAdmin(token); return true; }
function getEventBySlug(slug) { return findRow(APP_CONFIG.SHEETS.EVENTS, function (event) { return event.slug === String(slug || '').trim(); }); }
function canAccessEvent(token, event) {
  var session = requireSession(token), user = getUserById(session.id_usuario);
  if (!user) throw apiError('Usuario nao encontrado.', 'USER_NOT_FOUND', 404);
  if (inviteAdminEmails().indexOf(normalizeEmail(user.email)) !== -1) return { session: session, user: user };
  var access = findRow(APP_CONFIG.SHEETS.EVENT_ACCESS, function (item) { return item.id_evento === event.id_evento && item.id_usuario === user.id_usuario; });
  if (!access) throw apiError('Voce nao tem acesso a este evento.', 'FORBIDDEN', 403);
  return { session: session, user: user };
}
function createEvent(payload, token) {
  isGlobalAdmin(token); requireFields(payload, ['slug', 'nome', 'planilhaRsvpId', 'abaRsvp']);
  var slug = String(payload.slug).trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) throw apiError('Slug invalido.', 'INVALID_SLUG', 400);
  if (getEventBySlug(slug)) throw apiError('Ja existe um evento com este slug.', 'EVENT_ALREADY_EXISTS', 409);
  var event = { id_evento: generateId(), slug: slug, nome: String(payload.nome).trim(), planilha_rsvp_id: String(payload.planilhaRsvpId).trim(), aba_rsvp: String(payload.abaRsvp).trim(), status: 'ATIVO', criado_em: new Date() };
  insertRow(APP_CONFIG.SHEETS.EVENTS, event); return success('Evento cadastrado.', { event: event }, 201);
}
function assignEventAccess(payload, token) {
  isGlobalAdmin(token); requireFields(payload, ['slug', 'email']);
  var event = getEventBySlug(payload.slug), user = getUserByEmail(payload.email);
  if (!event) throw apiError('Evento nao encontrado.', 'EVENT_NOT_FOUND', 404);
  if (!user) throw apiError('Convide ou cadastre esta pessoa antes de liberar o evento.', 'USER_NOT_FOUND', 404);
  if (!findRow(APP_CONFIG.SHEETS.EVENT_ACCESS, function (item) { return item.id_evento === event.id_evento && item.id_usuario === user.id_usuario; })) {
    insertRow(APP_CONFIG.SHEETS.EVENT_ACCESS, { id_acesso: generateId(), id_evento: event.id_evento, id_usuario: user.id_usuario, papel: 'ADMIN_EVENTO', criado_em: new Date() });
  }
  return success('Acesso ao evento liberado.');
}
function listEvents(token) {
  isGlobalAdmin(token); return success('Eventos carregados.', { events: sheetRows(APP_CONFIG.SHEETS.EVENTS) });
}
function listMyEvents(token) {
  var session = requireSession(token), user = getUserById(session.id_usuario);
  var global = inviteAdminEmails().indexOf(normalizeEmail(user.email)) !== -1;
  var events = sheetRows(APP_CONFIG.SHEETS.EVENTS).filter(function (event) {
    if (event.status !== 'ATIVO') return false;
    return global || !!findRow(APP_CONFIG.SHEETS.EVENT_ACCESS, function (access) { return access.id_evento === event.id_evento && access.id_usuario === user.id_usuario; });
  }).map(function (event) { return { slug: event.slug, nome: event.nome }; });
  return success('Eventos disponíveis carregados.', { user: publicUser(user), isGlobalAdmin: global, events: events });
}
function listPublicEvents() {
  var events = sheetRows(APP_CONFIG.SHEETS.EVENTS).filter(function (event) { return event.status === 'ATIVO'; }).map(function (event) {
    return { slug: event.slug, nome: event.nome };
  });
  return success('Eventos públicos carregados.', { events: events });
}
function buildEventDashboard(event) {
  var sheet = SpreadsheetApp.openById(event.planilha_rsvp_id).getSheetByName(event.aba_rsvp);
  if (!sheet) throw apiError('A aba RSVP configurada nao foi encontrada.', 'RSVP_SHEET_NOT_FOUND', 404);
  var rows = sheet.getDataRange().getValues(); if (rows.length < 2) return { convidados: [], estatisticas: { respostas: 0, confirmados: 0, acompanhantes: 0, pessoas: 0, recusas: 0, taxaConfirmacao: 0, mediaAcompanhantes: 0, ultimaResposta: '-' } };
  var h = rows[0].map(function (value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }), data = h.indexOf('carimbo de data/hora'), name = h.indexOf('nome e sobrenome'), attend = h.indexOf('voce podera comparecer?'), companions = h.indexOf('alem de voce, quantos acompanhantes irao comparecer? (caso sejam mais de 4 acompanhantes basta escrever o numero)');
  if ([data, name, attend, companions].indexOf(-1) !== -1) throw apiError('Os cabecalhos da planilha RSVP nao correspondem ao modelo.', 'INVALID_RSVP_HEADERS', 400);
  var guests = [], confirmed = 0, absent = 0, companionTotal = 0, last = null;
  rows.slice(1).forEach(function (row) { var guestName = String(row[name] || '').trim(); if (!guestName) return; var yes = String(row[attend] || '').trim().toLowerCase() === 'sim'; var amount = yes ? (parseInt(String(row[companions] || '').match(/\d+/), 10) || 0) : 0; if (yes) { confirmed++; companionTotal += amount; } else absent++; if (row[data] && (!last || row[data] > last)) last = row[data]; guests.push({ nome: guestName, confirmado: yes, acompanhantes: amount, dataResposta: row[data] ? Utilities.formatDate(row[data], 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm') : '' }); });
  guests.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); }); var total = guests.length;
  return { convidados: guests, estatisticas: { respostas: total, confirmados: confirmed, acompanhantes: companionTotal, pessoas: confirmed + companionTotal, recusas: absent, taxaConfirmacao: total ? Number((confirmed * 100 / total).toFixed(2)) : 0, mediaAcompanhantes: confirmed ? Number((companionTotal / confirmed).toFixed(2)) : 0, ultimaResposta: last ? Utilities.formatDate(last, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm') : '-' } };
}
function getEventDashboard(payload, token) { requireFields(payload, ['slug']); var event = getEventBySlug(payload.slug); if (!event || event.status !== 'ATIVO') throw apiError('Evento nao encontrado.', 'EVENT_NOT_FOUND', 404); var context = canAccessEvent(token, event), dashboard = buildEventDashboard(event); return success('Dashboard carregado.', { event: { slug: event.slug, nome: event.nome }, user: publicUser(context.user), convidados: dashboard.convidados, estatisticas: dashboard.estatisticas, atualizadoEm: Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm') }); }


// ===== backend\apps-script\routes\Routes.gs =====
function routeRequest(method, route, payload, token) {
  var routes = {
    'POST:register': function () { return publicRegistrationDisabled(); },
    'POST:create-registration-invite': function () { return createRegistrationInvite(payload, token); },
    'POST:invite-global-admin': function () { return inviteGlobalAdmin(payload, token); },
    'POST:accept-registration-invite': function () { return acceptRegistrationInvite(payload); },
    'POST:create-event': function () { return createEvent(payload, token); },
    'POST:assign-event-access': function () { return assignEventAccess(payload, token); },
    'GET:public-events': function () { return listPublicEvents(); },
    'GET:events': function () { return listEvents(token); },
    'GET:my-events': function () { return listMyEvents(token); },
    'GET:event-dashboard': function () { return getEventDashboard(payload, token); },
    'GET:admin-users': function () { return listUsersForAdmin(token); },
    'POST:admin-delete-user': function () { return deleteUserForAdmin(payload, token); },
    'POST:login': function () { return login(payload); },
    'POST:confirm-registration': function () { return confirmRegistration(payload.token); },
    'GET:verify-email': function () { return confirmRegistration(payload.token); },
    'POST:resend-verification-email': function () { return resendVerification(payload); },
    'GET:profile': function () { return getProfile(token); },
    'PATCH:profile': function () { return updateProfile(token, payload); },
    'POST:change-email': function () { return requestEmailChange(token, payload); },
    'POST:confirm-email': function () { return confirmEmailChange(payload.token); },
    'POST:change-password': function () { return changePassword(token, payload); },
    'POST:forgot-password': function () { return forgotPassword(payload); },
    'POST:reset-password': function () { return resetPassword(payload); },
    'POST:logout': function () { closeSession(token); return success('Logout realizado.'); }
  };
  var normalizedRoute = route.replace(/^\//, '');
  var handler = routes[method + ':' + normalizedRoute];
  if (!handler) throw apiError('Rota não encontrada.', 'NOT_FOUND', 404);
  var result = handler();
  // A sessão só é renovada depois que a operação protegida termina com sucesso.
  if (['profile', 'change-email', 'change-password'].indexOf(normalizedRoute) !== -1) {
    renewSession(findRow(APP_CONFIG.SHEETS.SESSIONS, function (session) { return session.token === token; }));
  }
  return result;
}


// ===== backend\apps-script\main.gs =====
function doGet(event) { return handleRequest('GET', event); }
function doPost(event) { return handleRequest('POST', event); }

function handleRequest(method, event) {
  beginRequestContext();
  try {
    var params = (event && event.parameter) || {}, body = {};
    if (event && event.postData && event.postData.contents) body = JSON.parse(event.postData.contents);
    var payload = Object.assign({}, params, body);
    var route = payload.route || (event && event.pathInfo) || '';
    var requestedMethod = String(payload._method || method).toUpperCase();
    var token = payload.token || ((event && event.headers && (event.headers.Authorization || event.headers.authorization)) || '').replace(/^Bearer\s+/i, '');
    return toApiResponse(routeRequest(requestedMethod, route, payload, token));
  } catch (error) {
    if (error && error.isApiError) return toApiResponse(failure(error.message, error.code, error.status));
    console.error(error && error.stack ? error.stack : error);
    return toApiResponse(failure('Não foi possível concluir a operação.', 'INTERNAL_ERROR', 500));
  }
}
