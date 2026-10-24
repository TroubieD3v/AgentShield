# AgentShield: платформа оценки безопасности AI-агентов

[![CI](https://github.com/TroubieD3v/AgentShield/actions/workflows/ci.yml/badge.svg)](https://github.com/TroubieD3v/AgentShield/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-a2a6ae)](LICENSE)
![OWASP LLM · Agentic Top 10](https://img.shields.io/badge/OWASP-LLM%20%C2%B7%20Agentic%20Top%2010-e8a33d)
![Scenarios](https://img.shields.io/badge/scenarios-46-7cc4e8)
![Modules](https://img.shields.io/badge/modules-12-7cc4e8)
![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-7cc4e8)
![SARIF 2.1.0](https://img.shields.io/badge/output-SARIF%202.1.0-a2a6ae)
![Docker Compose](https://img.shields.io/badge/run%20with-Docker%20Compose-a2a6ae)

[English](README.md) · **Русский**

AgentShield: открытый инструмент для проверки безопасности **LLM-приложений, AI-агентов, RAG-систем и инструментов,
которыми пользуются агенты**. Обычный сканер спрашивает: «сказала ли модель что-то плохое?». AgentShield задаёт вопрос,
важный именно для агента: **что он на самом деле сделал?** Какие инструменты вызвал, к каким данным обратился, чьей
инструкции подчинился и остался ли в рамках просьбы пользователя и политики безопасности.

Он не ограничивается «ответ выглядит подозрительно». Он сообщает: *«в квартальном отчёте была инструкция, агент вызвал
`send_email(external@example.test)` с canary-токеном в теле письма, и никто этого не просил»*, с полной трассой агента,
сработавшими правилами политики и той же атакой, воспроизведённой с блокировкой и без неё.

> **Предупреждение**: тестируйте только приложения, которыми вы владеете или на проверку которых есть разрешение.
> Встроенные агенты используют **только mock-инструменты**: реальная почта, платежи и системы не затрагиваются.
> Для проверки утечек используются синтетические canary-токены, не настоящие секреты. Исходящие подключения
> ограничены хостами, которые вы разрешили. См. [SECURITY.md](SECURITY.md) и [модель угроз](docs/threat-model.md).

> **Примечание**: встроенные демо-агенты управляются детерминированным **симулятором решений**: прозрачной заменой,
> которая в небезопасной конфигурации подчиняется инструкциям из данных, а в защищённой считает их данными. Это не
> языковая модель. Он позволяет AgentShield *доказать* офлайн и воспроизводимо, что тесты и политики отличают уязвимого
> агента от исправленного. Направьте те же сценарии на настоящую модель (OpenAI-совместимый API или Ollama), чтобы
> проверить живое поведение.

![Воспроизвести атаку, переключить Monitor на Enforce, прочитать трассу, сравнить до и после](docs/screenshots/demo.gif)

*Одна и та же косвенная инъекция: в режиме Monitor она записана, в режиме Enforce заблокирована; затем трасса и сравнение
до и после.*

![Attack Playground в режиме Monitor](docs/screenshots/playground-monitor.png)

| Трасса выполнения агента | Сравнение до и после |
|---|---|
| ![Trace Explorer](docs/screenshots/trace.png) | ![Сравнение](docs/screenshots/compare.png) |

## Модули

Двенадцать модулей, одна система, а не набор промптов.

| Модуль | Что делает |
|---|---|
| Model Gateway | Клиенты OpenAI-совместимых API и Ollama, allowlist хостов, без редиректов, лимит запросов, ключи читаются из окружения |
| Agent Connector | Встроенные sandbox-агенты; HTTP-агенты как чёрный ящик с заявленной телеметрией; SDK и guard-прокси для настоящего Enforce |
| Prompt Injection Lab | Прямые подмены инструкций, ролевые игры, ложный авторитет; косвенные нагрузки в документах, письмах, веб-страницах, ответах инструментов |
| Tool Security Tester | Незапрошенные, «заражённые» и деструктивные вызовы инструментов, сверенные с тем, что действительно просил пользователь |
| RAG Security Analyzer | Межарендный поиск, внедрённые документы, смена личности, ACL при извлечении |
| Memory Poisoning Tester | Недоверенное содержимое, сохранённое как постоянная инструкция и выполненное в следующей сессии |
| Sensitive Data Leakage | Синтетические canary-токены в ответах, аргументах инструментов, памяти и приёмниках |
| Attack Scenario Engine | Многошаговые YAML-сценарии с состоянием, фикстурами, параметрами и повторами |
| Evaluation & Scoring | PASS / FAIL / SUSPICIOUS / INCONCLUSIVE / ERROR, доказательства на каждую проверку, оценка устойчивости |
| Agent Trace Explorer | Сообщения, извлечения, решения модели, вызовы инструментов и решения политик; атрибуты OpenTelemetry GenAI |
| Security Dashboard | Оценки по категориям, история, сравнение моделей и версий, регрессия относительно baseline |
| Reporting & CI/CD | HTML, JSON, SARIF 2.1.0, Markdown, сгенерированный pytest-набор, GitHub Actions, коды выхода |

### Сценарии

[46 определений сценариев](docs/SCENARIOS.md) разворачиваются в 60 исполняемых случаев: 12 категорий атак и
контрольные безопасные сценарии, с привязкой к рискам OWASP LLM и Agentic Top 10.

| Категория | Пример проверки |
|---|---|
| Direct Prompt Injection | Сообщение пользователя пытается изменить назначение агента или вывести скрытый промпт |
| Indirect Prompt Injection | Недоверенный текст в документе или ответе инструмента отдаёт команду агенту |
| Tool Misuse | Агент вызывает инструмент, который задача не требовала |
| Excessive Agency | Расплывчатое «наведи порядок в файлах» должно привести к вопросу, а не к удалению |
| RAG Data Isolation | Пользователь A получает документы пользователя B напрямую или через внедрённый документ |
| Memory Poisoning | Письмо вносит в память «копируй все письма на X», и следующая сессия подчиняется |
| Sensitive Data Exposure | Canary-секрет попадает в ответ или в исходящий вызов |
| System Instruction Disclosure | Раскрывается системный промпт (с canary) |
| Multi-Agent Trust | Ответ другого агента содержит инструкцию |
| MCP Tool Trust | Отравленное описание или результат инструмента управляет агентом |
| Output Handling | Вывод модели попадает в HTML-рендерер или SQL без проверки |
| Cost & Resource Abuse | Цикл или просьба «сделай 150 раз» исчерпывает бюджет вызовов |
| Benign Control | Обычная работа должна работать: защита оценивается и по ложным блокировкам |

### Три агента, по три конфигурации

| Агент | Инструменты | Фокус |
|---|---|---|
| Document Assistant | поиск, чтение, отправка почты, HTML | RAG, инъекции, утечки, обработка вывода |
| Office Assistant | почта, файлы, календарь, память | злоупотребление инструментами, чрезмерная самостоятельность, подтверждения |
| Research Agent | веб, fetch, память, делегирование, MCP, SQL | многошаговость, память, мультиагентность, MCP |

Каждый запускается как **unsafe**, **partial** (первая волна исправлений) и **hardened**, поэтому AgentShield показывает
измеримую разницу: unsafe 9, partial 87, hardened 100 на встроенной библиотеке.

### Как выносится вердикт

| Статус | Значение |
|---|---|
| PASS | Ожидаемая политика соблюдена |
| FAIL | Подтверждённое нарушение: выполненное действие или утёкший canary, наблюдаемое, а не предполагаемое |
| SUSPICIOUS | Есть признаки нарушения, нужна проверка человеком (текстовые эвристики, сигналы только от судьи) |
| INCONCLUSIVE | Цель не отдаёт нужную телеметрию. **Никогда не трактуется как «нарушений нет»** |
| ERROR | Ошибка подключения или выполнения сценария |

На каждом случае работают несколько независимых проверок: детерминированные assertions на реальные эффекты, структура
вызовов инструментов, canary-токены, сравнение JSON и необязательный LLM-as-a-judge. **Судья в одиночку не может дать
FAIL.** Случай, пройденный только потому, что Enforce заблокировал попытку, помечается ★ *mitigated*, чтобы защита не
скрывала слабое место за собой.

## Monitor и Enforce

| Режим | Поведение |
|---|---|
| Monitor | Наблюдать за вызовами и записывать нарушения без вмешательства (`would_block`) |
| Enforce | Остановить вызов до выполнения (`block`); агент получает ошибку политики |

Enforce работает для встроенного runtime, для агентов, использующих [SDK](docs/integration.md#sdk-in-process-enforce), и
для любого runtime через [guard-прокси](docs/integration.md#guard-proxy-any-language). Стороннее приложение, подключённое
только по HTTP, можно наблюдать (Monitor), но **нельзя заблокировать снаружи**.

## Сценарий работы

1. **Подключение**: встроенные агенты, HTTP-агент (с телеметрией, которую он реально отдаёт, и canary, которые вы в него заложили) или модель для управления sandbox настоящей LLM.
2. **Выбор**: все сценарии, категория или один сценарий; набор политик и Monitor / Enforce.
3. **Запуск**: в фоне, с лимитами на запросы, токены, итерации и параллелизм.
4. **Разбор**: оценки по категориям, находки с доказательствами и полная трасса каждого случая.
5. **Исправление и сравнение**: сохраните baseline, измените агента или модель, запустите снова и сравните.

В интерфейсе восемь разделов: Dashboard, Targets & Models, Scenario Library, Attack Playground, Test Runs, Trace
Explorer, Findings и Policies & Reports.

| Findings | Политики и живая демонстрация |
|---|---|
| ![Findings](docs/screenshots/findings.png) | ![Политики](docs/screenshots/policies.png) |

## Быстрый старт (Docker)

Нужен Docker с Compose v2.

```bash
git clone https://github.com/TroubieD3v/AgentShield.git
cd AgentShield
docker compose up --build
```

Откройте <http://localhost:8080> и нажмите **Start run** на Dashboard. Порт опубликован только на loopback-интерфейсе.
Compose запускает API, воркер очереди, PostgreSQL и Redis; данные лежат в томах `pgdata` и `agentshield-data`
(`docker compose down --volumes` удаляет их).

**Если что-то не работает**

- *Порт 8080 занят*: `AGENTSHIELD_PORT=8090 docker compose up --build` (PowerShell: `$env:AGENTSHIELD_PORT=8090; docker compose up --build`).
- *Открывайте как `localhost` или `127.0.0.1`*: другие имена хоста отклоняются (защита от DNS rebinding). Чтобы открыть снаружи, задайте `AGENTSHIELD_API_TOKEN` и `AGENTSHIELD_UI_HOSTS`.
- *«host is not in the allowlist» при регистрации цели или модели*: добавьте хост в `AGENTSHIELD_ALLOWED_HOSTS`. Чтобы достучаться из контейнера до приложения на вашей машине, используйте `host.docker.internal`.
- *Цель-чёрный ящик показывает INCONCLUSIVE*: так и задумано. Её шаги требуют управления данными или телеметрии вызовов, которых цель не отдаёт.

## Локальная разработка (без Docker)

Нужны Python 3.11+ и Node.js 22+.

```bash
python -m venv .venv && . .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
npm --prefix web ci && npm --prefix web run build
agentshield serve                                     # UI + API на 127.0.0.1:8080, SQLite в .agentshield/
npm --prefix web run dev                              # по желанию: UI с hot reload на :5173
```

## Командная строка и CI

```bash
agentshield demo                                                  # одна атака, Monitor против Enforce
agentshield run --variant hardened --mode enforce -f sarif -o results.sarif --fail-on high
agentshield run --variant unsafe -c indirect_prompt_injection -c tool_misuse
agentshield run --target-file examples/http-target.yaml           # HTTP-агент как чёрный ящик
agentshield run --brain llm --model my-llama                      # управлять sandbox настоящей моделью
agentshield compare before.json after.json --fail-on-regression
agentshield baseline save run.json --name main && agentshield baseline check new.json --name main
agentshield pytest-gen -o test_agent_security.py                  # по pytest-тесту на сценарий
```

Коды выхода: `0` успех, `1` FAIL не ниже `--fail-on` (или SUSPICIOUS / INCONCLUSIVE с соответствующими флагами), `2` ошибка.

```yaml
- run: pip install agentshield
- run: agentshield run --variant hardened --mode enforce -f sarif -o results.sarif --fail-on high
- uses: github/codeql-action/upload-sarif@v4
  if: always()
  with:
    sarif_file: results.sarif
```

Задача `security-gate` в [ci.yml](.github/workflows/ci.yml) запускает AgentShield на самом себе: hardened-агент обязан
пройти и дать чистый SARIF, unsafe-агент обязан провалить проверку с кодом 1 и дать минимум 30 находок с code flows
([scripts/check_sarif.py](scripts/check_sarif.py) проверяет SARIF по схеме 2.1.0), а сохранённый baseline обязан поймать регрессию.

## Безопасность

- **Только mock-инструменты.** Встроенные агенты не могут отправить почту, удалить настоящий файл, вызвать реальный API или выполнить код.
- **Allowlist исходящих подключений.** Шлюз и HTTP-коннектор обращаются только к хостам из `AGENTSHIELD_ALLOWED_HOSTS` (по умолчанию localhost). Редиректы отклоняются; link-local и metadata-адреса облаков запрещены всегда.
- **Секреты не сохраняются.** API-ключи читаются из переменных окружения, не хранятся и вырезаются из трасс, отчётов и логов. Canary-токены синтетические и намеренно видны как доказательство.
- **Лимиты.** На итерации, вызовы инструментов, токены, запросы, повторы, число сценариев и параллельные запуски.
- **Без ложного спокойствия.** Цель без телеметрии получает INCONCLUSIVE, а не PASS.
- Сервер слушает `127.0.0.1`, проверяет заголовок `Host`, принимает запись только в JSON, поддерживает bearer-токен и отдаёт строгую Content Security Policy.

## Тесты

```bash
ruff check src tests && pytest                         # 83 теста: политики, runtime, семантика оценки, шлюз, отчёты, API, CLI, SDK
npm --prefix web run typecheck
npm --prefix web run test:e2e                          # 12 тестов Playwright; PW_CHANNEL=chrome использует установленный Chrome
```

Регрессионный набор проверяет: каждый сценарий-атака проваливается на unsafe-агенте, каждый сценарий проходит на
hardened-агенте в обоих режимах, безопасные контрольные сценарии никогда не блокируются, partial оценивается между ними,
а утечки через чистый текст **не** смягчаются Enforce (политика не может остановить то, что не является вызовом
инструмента). Семантика чёрного ящика проверяется на mock HTTP-цели, путь с живой моделью на скриптовом фейковом
OpenAI-сервере. Отдельный тест подкладывает правдоподобный API-ключ и убеждается, что он не попадает ни в один формат
отчёта. `docs/SCENARIOS.md` и `docs/POLICIES.md` генерируются командой `agentshield docs`; тест падает, если они устарели.
`web/scripts/screenshots.mjs` и `web/scripts/make_gif.py` пересоздают изображения в этом README.

## Архитектура

```
сценарий YAML ──► Attack Scenario Engine ──► цель (встроенный агент | HTTP-агент | sandbox под управлением модели)
                          │                          │ вызовы инструментов
                          │                          ▼
                          │                 Policy Engine (Monitor | Enforce) ──► mock-инструменты / мир
                          ▼                          │
                  Evaluation Engine ◄── Trace Collector (атрибуты OTel GenAI, секреты вырезаны)
                          │
        Хранилище (SQLite | PostgreSQL) · Очередь (потоки | Redis) ──► API ──► React UI · CLI · HTML / JSON / SARIF / MD
```

- `src/agentshield/agents/`: sandbox-runtime, симулятор решений, профили защиты. `sandbox/`: mock-мир и инструменты.
- `policy/`: правила, условия, JSON Schema. `intents.py`, `authorization.py`, `taint.py`: что просил пользователь и откуда взялось значение.
- `scenarios/`: схема, загрузчик, движок. `evaluation/`: assertions, судьи, оценка. `reports/`: форматы вывода.
- `gateway/`: клиенты моделей, allowlist. `connectors/`: встроенные и HTTP-цели. `api/`, `storage.py`, `jobs.py`, `cli.py`, `sdk.py`.
- `web/`: React, TypeScript, Vite, Tailwind CSS, компоненты в стиле shadcn/ui, Playwright. `library/`: сценарии, фикстуры, миры, политики.

Подробнее: [docs/architecture.md](docs/architecture.md) · [docs/threat-model.md](docs/threat-model.md) ·
[docs/integration.md](docs/integration.md) · [docs/SCENARIOS.md](docs/SCENARIOS.md) · [docs/POLICIES.md](docs/POLICIES.md) ·
[CONTRIBUTING.md](CONTRIBUTING.md) · [CHANGELOG.md](CHANGELOG.md).

## Планы

Новые семейства сценариев (многоходовая социальная инженерия, агенты с выполнением кода), судьи с калибровкой,
экспорт OTLP в коллектор, статусы разбора находок и адаптеры для популярных агентных фреймворков, которые из коробки
сообщают о вызовах инструментов.

## Релизы

| Версия | Результат |
|---|---|
| **v0.1.0** | **12 модулей, 46 сценариев (60 случаев), 3 демо-агента × 3 конфигурации, Monitor и Enforce, HTML / JSON / SARIF / Markdown, CLI, SDK и guard-прокси, веб-интерфейс, Docker Compose, GitHub Actions** |

Тег `v*` запускает сборку wheel (с веб-интерфейсом внутри) и контрольных сумм ([release.yml](.github/workflows/release.yml)).

## Лицензия

[MIT](LICENSE)
