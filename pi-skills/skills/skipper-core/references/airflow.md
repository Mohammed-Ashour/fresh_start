# Airflow policy

- Keep DAG structure readable as a workflow at import time.
- Avoid network, database, and large-file I/O during DAG parsing.
- Make Variables, Connections, secrets, templates, logical dates, and time zones explicit enough to operate safely.
- For every writing task, define output identity, idempotency or overwrite behavior, retry behavior, timeout, and partial-failure behavior.
- Account for duplicate execution, backfills, reruns, cancellation, and concurrent runs.
- Use trigger rules, pools, concurrency limits, task mapping, and XCom only for a current requirement.
- Bound dynamic task generation and keep workflow shape inspectable.
- Keep XCom payloads small and use durable storage for data products.
- Expose DAG run, task attempt, dataset or partition, and output identity where operators need them.
- Verify with focused task tests, DAG import checks, and relevant execution or rendering checks.
