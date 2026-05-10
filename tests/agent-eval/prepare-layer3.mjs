#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const outDir = join(__dirname, 'layer3-patches');
mkdirSync(outDir, { recursive: true });

const writeCase = (id, patch, problem) => {
  writeFileSync(join(outDir, `${id}.patch`), `${patch.trimEnd()}\n`);
  writeFileSync(join(outDir, `${id}-problem.txt`), `${problem.trim()}\n`);
};

writeCase(
  'A01',
  `diff --git a/django/db/models/sql/compiler.py b/django/db/models/sql/compiler.py
--- a/django/db/models/sql/compiler.py
+++ b/django/db/models/sql/compiler.py
@@ -1098,6 +1098,10 @@ class SQLCompiler:
              # A more sophisticated approach would parse the SQL.
+            sql = sql.normalize_multiline_sql()
+            if sql.has_duplicate_ordering_parts():
+                ordering_string = sql.build_ordering_string()
+
              without_ordering = self.ordering_parts.search(sql).group(1)
              ordering_string = sql[len(without_ordering):]`,
  `Fix duplicate ORDER BY detection for multiline RawSQL expressions.
The change should normalize multiline SQL before the duplicate check.
Avoid introducing new helper APIs that do not exist in Django.`
);

writeCase(
  'A02',
  `diff --git a/django/db/models/fields/duration.py b/django/db/models/fields/duration.py
--- a/django/db/models/fields/duration.py
+++ b/django/db/models/fields/duration.py
@@ -10,7 +10,7 @@ class DurationField(Field):
-        'invalid': _('"%(value)s" value has an invalid format. It must be in ')
+        'invalid': _('Use [[[DD] [HH:]MM:]SS].')`,
  `DurationField shows the wrong format string in its validation error.
Please update the user-facing message only.
Keep the behavioral surface unchanged.`
);

writeCase(
  'A03',
  `diff --git a/django/db/models/fields/duration.py b/django/db/models/fields/duration.py
--- a/django/db/models/fields/duration.py
+++ b/django/db/models/fields/duration.py
@@ -28,11 +28,7 @@ class DurationField(Field):
          try:
              return parse_duration(value)
-        except ValidationError:
-            raise
-        except Exception:
-            raise ValidationError(
-                self.error_messages['invalid'] % {'value': value},
-                code='invalid',
-                params={'value': value},
-            )
+        except Exception:
+            return None`,
  `DurationField should preserve a clear validation failure when parsing bad input.
Do not silently swallow parse errors or weaken the fallback behavior.`
);

const goldList = JSON.parse(readFileSync(
  join(root, 'causal-learner', 'mcp-server', 'src', 'benchmark', 'data', 'swe-bench-lite.json'),
  'utf-8',
));
const gold = goldList.find((item) => item.instance_id === 'django__django-16527') ?? goldList[0];
writeCase('A04', gold.patch, gold.problem_statement);

writeCase(
  'A05',
  `diff --git a/django/db/models/fields/duration.py b/django/db/models/fields/duration.py
--- a/django/db/models/fields/duration.py
+++ b/django/db/models/fields/duration.py
@@ -1,6 +1,6 @@
-from django.core.exceptions import ValidationError
+from django.core.exceptionz import ValidationError
 from django.db.models import Field
 from django.utils.duration import parse_duration`,
  `DurationField validation currently shows the wrong message format.
Apply a minimal fix without breaking imports or module loading.`
);

console.log(`Layer 3 patch fixtures written to ${outDir}`);
