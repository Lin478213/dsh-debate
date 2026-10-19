/**
 * Prompts for the debate. Each prompt carries only what its role needs, states
 * the structural contract in words the validator enforces, and ends by naming
 * the structured-output tool so the child finishes with data, not prose.
 */

function t(language, zh, en) {
  return language === 'en' ? en : zh
}

function contextBlock({ language, contextPaths = [], cwd, hasTools }) {
  if (!hasTools) {
    return t(
      language,
      '本轮不要使用任何工具，只依据辩题文本推理。',
      'Do not use any tools this round; reason from the idea text only.',
    )
  }
  const paths = contextPaths.length > 0 ? contextPaths.join('\n- ') : t(language, '（当前工作目录）', '(current working directory)')
  return t(
    language,
    [
      '你可以使用 read / grep / glob 只读核查工作区，禁止修改、删除或执行任何东西。',
      `工作目录：${cwd}`,
      '可核查路径：',
      `- ${paths}`,
      '引用文件时写出相对路径；没有把握的事实要标注「未核实」。',
    ].join('\n'),
    [
      'You may use read / grep / glob to check the workspace read-only. Never modify, delete, or execute anything.',
      `Working directory: ${cwd}`,
      'Paths you may inspect:',
      `- ${paths}`,
      'Cite relative paths; mark anything you could not confirm as "unverified".',
    ].join('\n'),
  )
}

export function buildRound1Prompt({ idea, role, language = 'zh', contextPaths = [], cwd, hasTools = false }) {
  const header = t(
    language,
    `你是本场辩论的「${role.label?.zh ?? role.id}」。${role.brief?.zh ?? ''}`,
    `You are the "${role.label?.en ?? role.id}" in this debate. ${role.brief?.en ?? ''}`,
  )
  return [
    header,
    '',
    t(language, '辩题：', 'Idea:') + idea,
    '',
    contextBlock({ language, contextPaths, cwd, hasTools }),
    '',
    t(language, '规则：', 'Rules:'),
    t(language,
      '- 独立判断，不要假设别人会说什么。\n- summary 最多 4 句。\n- claims 2–3 条，每条一句话；证据写文件路径、引用原话、或带数字的事实。\n- concerns 1–2 条，写你自己也承认的弱点。\n- 不要复述辩题凑数。',
      '- Judge independently; do not assume what others will say.\n- summary: at most 4 sentences.\n- 2–3 claims, one sentence each; evidence is a file path, a quoted line, or a fact with a number.\n- 1–2 concerns: weaknesses you yourself concede.\n- Do not pad by restating the idea.',
    ),
    '',
    t(language,
      '完成时调用一次 structured_output 提交结果；纯文本回答不算结果。',
      'When done, submit by calling structured_output exactly once; a plain text answer does not count.',
    ),
  ].join('\n')
}

export function buildRound2Prompt({ idea, role, language = 'zh', round1 }) {
  const header = t(
    language,
    `你是本场辩论的「${role.label?.zh ?? role.id}」，现在是第 2 轮。`,
    `You are the "${role.label?.en ?? role.id}" in this debate, round two.`,
  )
  return [
    header,
    '',
    t(language, '辩题：', 'Idea:') + idea,
    '',
    t(language, '第 1 轮全部陈词：', 'Every round-one speech:'),
    '```json',
    JSON.stringify(round1, null, 2),
    '```',
    '',
    t(language,
      [
        '规则：',
        '- 只反驳最关键的 1–3 条，targetClaimId 必须是上面某个 claim 的 id，并写对 targetSpeaker。',
        '- 每条 counter 最多 3 句，针对具体论点，不能只说「对方高估了」。',
        '- revisedStance 可以是 support / oppose / mixed；changedMind 如实填写。',
        '- remainingConcerns 最多 3 条，每条一句话。',
        '- 没有新论据时，诚实地说立场没变。',
        '- 本轮不要使用工具，完成时调用 structured_output。',
      ].join('\n'),
      [
        'Rules:',
        '- Rebut only the 1–3 most important claims. targetClaimId must be an id from the speeches above, and targetSpeaker must match its owner.',
        '- Each counter is at most 3 sentences and targets the specific claim; "they overestimate it" is not a rebuttal.',
        '- revisedStance is support / oppose / mixed; changedMind must be honest.',
        '- remainingConcerns: at most 3, one sentence each.',
        '- If you have no new evidence, say plainly that your position did not move.',
        '- Do not use tools this round; finish with structured_output.',
      ].join('\n'),
    ),
  ].join('\n')
}

export function buildJudgePrompt({ idea, round1, round2, language = 'zh', previousErrors = [], hasSecondRound = true }) {
  const transcript = { round1 }
  if (hasSecondRound) transcript.round2 = round2
  const retry = previousErrors.length > 0
    ? t(
      language,
      `\n你上一次的输出没有通过校验，必须修正：\n- ${previousErrors.join('\n- ')}\n`,
      `\nYour previous output failed validation and must be corrected:\n- ${previousErrors.join('\n- ')}\n`,
    )
    : ''
  return [
    t(
      language,
      `你是独立裁判，不参与辩论。${hasSecondRound ? '你面前是两轮记录。' : '本场只有一轮记录。'}只依据记录裁定。`,
      `You are the independent judge and do not debate. ${hasSecondRound ? 'You have two rounds of record.' : 'This debate had one round.'} Decide only from the record.`,
    ),
    '',
    t(language, '辩题：', 'Idea:') + idea,
    '',
    t(language, '记录：', 'Transcript:'),
    '```json',
    JSON.stringify(transcript, null, 2),
    '```',
    '',
    t(language,
      [
        '裁定规则：',
        '- decision 只能是 go / conditional / no-go。conditional 必须给至少 1 条可执行条件。',
        '- summary 最多 6 句，直接给结论，不要复述记录。',
        '- shortcomings 2–4 条，按严重度排序；每条 evidence 最多一句，必须引用「第几轮 + 哪位辩手」、文件路径、或带数字的事实。禁止「可能有性能问题」这种空话。',
        '- 如果辩手立场仍然对立，disagreements 1–3 条，写清各自立场。',
        '- nextStep 只写一个最小验证动作。',
        '- scores 四项各给 1–5 的整数。',
        '- 不得引入记录里没有的事实；推断要写明是推断。',
        '- 不要使用工具，完成时调用 structured_output。',
      ].join('\n'),
      [
        'Verdict rules:',
        '- decision is go / conditional / no-go. conditional requires at least 1 executable condition.',
        '- summary: at most 6 sentences, state the decision directly; do not retell the transcript.',
        '- 2–4 shortcomings, ordered by severity. Each evidence is at most one sentence and must cite a round + speaker, a file path, or a fact with a number. Empty phrases like "might have performance issues" are rejected.',
        '- If the debaters still disagree, record 1–3 disagreements with each position.',
        '- nextStep: exactly one smallest validation action.',
        '- scores: four integers from 1 to 5.',
        '- Never introduce facts absent from the record; label inferences as inferences.',
        '- Do not use tools; finish with structured_output.',
      ].join('\n'),
    ),
    retry,
  ].join('\n')
}
