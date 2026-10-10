"""Recovery ownership contract; no Docker or live broker is touched by these tests."""
import copy
from contextlib import ExitStack
import socket
import ssl
import threading
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('emqx_tls', Path(__file__).parents[1] / 'emqx-test-tls.py')
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


class RecoveryTests(unittest.TestCase):
    def fixture(self, directory):
        original = {'bind': '0.0.0.0:8883', 'enable': True,
                    'ssl_options': {'certfile': '/original/cert', 'keyfile': '/original/key'}}
        state = {'status': 'READY', 'original': original,
                 'installed': {**original, 'ssl_options': {'certfile': '/tmp/test/cert'}},
                 'mountpoint': '${client_attrs.tc_auth_mountpoint}',
                 'identity': {'authentication': [], 'authorization': []},
                 'dashboardPort': 18083, 'container': 'owned-broker',
                 'containerDirectory': '/tmp/tc-test-tls-' + 'a' * 24}
        tool.save(directory / 'state.json', state)
        return state

    def test_recovery_refuses_unrelated_listener_change_without_mutating_or_deleting(self):
        with tempfile.TemporaryDirectory() as value:
            directory = Path(value)
            state = self.fixture(directory)
            with patch.object(tool, 'Broker') as factory, patch.object(tool, 'run') as run:
                broker = factory.return_value
                broker.call.return_value = {**state['installed'], 'bind': '0.0.0.0:9883'}
                with self.assertRaisesRegex(RuntimeError, 'independently changed'):
                    tool.restore(SimpleNamespace(directory=directory))
                self.assertEqual(broker.call.call_count, 1)
                run.assert_not_called()
                self.assertEqual(json.loads((directory / 'state.json').read_text())['status'], 'RESTORE_FAILED')

    def test_recovery_confirms_listener_identity_before_removing_exact_owned_directory(self):
        with tempfile.TemporaryDirectory() as value:
            directory = Path(value)
            state = self.fixture(directory)
            with patch.object(tool, 'Broker') as factory, patch.object(tool, 'run') as run:
                broker = factory.return_value
                current = {**copy.deepcopy(state['installed']), 'mountpoint': state['mountpoint']}
                def call(method, path, body=None):
                    if method == 'PUT':
                        current.update(body)
                        return None
                    return copy.deepcopy(current)
                broker.call.side_effect = call
                broker.identity.return_value = state['identity']
                tool.restore(SimpleNamespace(directory=directory))
                run.assert_called_once_with('docker', 'exec', '--user', 'root', 'owned-broker',
                                            'rm', '-rf', '--', state['containerDirectory'])
                self.assertEqual(json.loads((directory / 'state.json').read_text())['status'], 'RESTORED')

    def test_conflicted_listener_still_revokes_only_owned_key_and_preserves_tls_material(self):
        with tempfile.TemporaryDirectory() as value:
            directory = Path(value)
            state = self.fixture(directory)
            name = 'tc-tls-metrics-' + 'b' * 24
            state['metricsKeyName'] = name
            tool.save(directory / 'state.json', state)
            tool.save(directory / 'metrics-context.json', {'apiSecret': 'private'})
            with patch.object(tool, 'Broker') as factory, patch.object(tool, 'run') as run:
                broker = factory.return_value
                def call(method, path, body=None, allow_missing=False):
                    if path == '/listeners/ssl%3Adefault':
                        return {**state['installed'], 'bind': '0.0.0.0:9883'}
                    self.assertEqual(path, '/api_key/' + name)
                    self.assertTrue(allow_missing)
                    return None
                broker.call.side_effect = call
                with self.assertRaisesRegex(RuntimeError, 'independently changed'):
                    tool.restore(SimpleNamespace(directory=directory))
                broker.call.assert_any_call('DELETE', '/api_key/' + name, allow_missing=True)
                run.assert_not_called()
                self.assertFalse((directory / 'metrics-context.json').exists())
                saved = json.loads((directory / 'state.json').read_text())
                self.assertEqual(saved['status'], 'RESTORE_FAILED')
                self.assertIn('independently changed', saved['restoreErrors'][0])

    def test_listener_and_key_failures_are_both_retained_without_claiming_restoration(self):
        with tempfile.TemporaryDirectory() as value:
            directory = Path(value)
            state = self.fixture(directory)
            state['metricsKeyName'] = 'tc-tls-metrics-' + 'b' * 24
            tool.save(directory / 'state.json', state)
            with patch.object(tool, 'Broker') as factory, patch.object(tool, 'run') as run:
                factory.return_value.call.side_effect = RuntimeError('broker offline')
                with self.assertRaisesRegex(RuntimeError, 'listener:.*metrics key:'):
                    tool.restore(SimpleNamespace(directory=directory))
                self.assertEqual(factory.return_value.call.call_count, 2)
                run.assert_not_called()
                self.assertEqual(len(json.loads((directory / 'state.json').read_text())['restoreErrors']), 2)

    def test_key_deletion_requires_exact_missing_readback_not_a_truncated_listing(self):
        with tempfile.TemporaryDirectory() as value:
            directory = Path(value)
            state = self.fixture(directory)
            name = 'tc-tls-metrics-' + 'b' * 24
            state['metricsKeyName'] = name
            tool.save(directory / 'state.json', state)
            tool.save(directory / 'metrics-context.json', {'apiSecret': 'private'})
            with patch.object(tool, 'Broker') as factory, patch.object(tool, 'run') as run:
                broker = factory.return_value
                broker.identity.return_value = state['identity']
                def call(method, path, body=None, allow_missing=False):
                    if path == '/listeners/ssl%3Adefault':
                        return {**state['original'], 'mountpoint': state['mountpoint']}
                    self.assertEqual(path, '/api_key/' + name)
                    return {'name': name} if method == 'GET' else None
                broker.call.side_effect = call
                with self.assertRaisesRegex(RuntimeError, 'deletion not confirmed'):
                    tool.restore(SimpleNamespace(directory=directory))
                run.assert_not_called()
                self.assertTrue((directory / 'metrics-context.json').exists())

    def test_redirect_cannot_forward_dashboard_bearer_or_login_context(self):
        request = tool.urllib.request.Request('http://127.0.0.1:18083/api/v5/listeners',
                                             headers={'Authorization': 'Bearer private'})
        with self.assertRaisesRegex(RuntimeError, 'redirect refused'):
            tool.NoRedirect().redirect_request(request, None, 302, 'Found', {}, 'https://example.invalid')

    def test_partial_material_generation_without_state_cannot_change_broker(self):
        with tempfile.TemporaryDirectory() as value, patch.object(tool, 'Broker') as broker:
            tool.restore(SimpleNamespace(directory=Path(value)))
            broker.assert_not_called()


class StrictBroker:
    """Offline EMQX 6.2 typed-body counterexample, not live Broker qualification."""
    def __init__(self, fail_phase=None):
        self.listener = {'id': 'ssl:default', 'type': 'ssl', 'bind': ':8883', 'enable': True,
                         'ssl_options': {'certfile': '/original/cert', 'keyfile': '/original/key',
                                         'verify': 'verify_none'},
                         'mountpoint': '${client_attrs.tc_auth_mountpoint}'}
        self.auth = {'authentication': [{'enable': True}], 'authorization': [{'type': 'http'}]}
        self.calls = []; self.reads = 0; self.identities = 0; self.keys = {}; self.fail_phase = fail_phase

    def call(self, method, path, body=None, allow_missing=False):
        self.calls.append((method, path, copy.deepcopy(body)))
        if path == '/listeners/ssl%3Adefault':
            if method == 'PUT':
                if body.get('id') != 'ssl:default' or body.get('type') != 'ssl':
                    raise tool.FixtureError('BROKER_HTTP_REFUSED', 'missing API discriminator', method='PUT', httpStatus=400)
                if self.fail_phase == 'listener-update':
                    raise tool.FixtureError('BROKER_HTTP_REFUSED', 'private response token secret', method='PUT', httpStatus=400)
                self.listener.update(copy.deepcopy(body))
            else:
                self.reads += 1
                if self.reads == 2 and self.fail_phase == 'listener-readback':
                    raise RuntimeError('secret from readback')
            return copy.deepcopy(self.listener)
        if method == 'POST' and path == '/api_key':
            self.keys[body['name']] = {'role': 'viewer'}
            if self.fail_phase == 'metrics-key-create':
                raise tool.FixtureError('BROKER_HTTP_REFUSED', 'unknown create outcome with secret', method='POST', httpStatus=503)
            return {'api_key': 'private-key', 'api_secret': 'private-secret'}
        name = path.split('/')[-1]
        if method == 'DELETE':
            self.keys.pop(name, None)
            return None
        if self.fail_phase == 'metrics-key-readback':
            return {'role': 'administrator'}
        return self.keys.get(name)

    def identity(self):
        self.identities += 1
        if self.identities == 2 and self.fail_phase == 'identity-readback':
            return {'authentication': [], 'authorization': []}
        return copy.deepcopy(self.auth)


class InstallationTests(unittest.TestCase):
    def fixture(self, root, fail_phase=None):
        directory = root / 'private-tls'
        args = SimpleNamespace(directory=directory, dashboard_port=18083, mqtt_port=8883,
                               container='owned-broker', metrics_key=True)
        broker = StrictBroker(fail_phase)
        context = MagicMock()
        context.wrap_socket.return_value.__enter__.return_value.version.return_value = 'TLSv1.3'
        if fail_phase == 'tls-handshake-and-hostname-verification':
            context.wrap_socket.side_effect = ssl.SSLError('secret TLS detail')
        def generate(target, *, create_directory=True):
            self.assertFalse(create_directory)
            (target / 'ca.pem').write_text('fixture public CA placeholder')
        def run(*args):
            return b'1000' if args[-2:] == ('id', '-u') else b''
        stack = ExitStack()
        stack.enter_context(patch.object(tool, 'Broker', return_value=broker))
        stack.enter_context(patch.object(tool, 'generate', side_effect=generate))
        stack.enter_context(patch.object(tool, 'run', side_effect=run))
        factory = stack.enter_context(patch.object(tool.ssl, 'create_default_context', return_value=context))
        connect = stack.enter_context(patch.object(tool.socket, 'create_connection', return_value=MagicMock()))
        if fail_phase == 'tls-context': factory.side_effect = RuntimeError('secret CA context')
        if fail_phase == 'tls-connect': connect.side_effect = TimeoutError('secret connection')
        return stack, args, broker, context

    def test_old_projection_is_rejected_but_install_and_restore_use_typed_api_contract(self):
        with tempfile.TemporaryDirectory() as value:
            stack, args, broker, context = self.fixture(Path(value))
            original = copy.deepcopy(broker.listener)
            with stack:
                with self.assertRaises(tool.FixtureError):
                    broker.call('PUT', '/listeners/ssl%3Adefault', tool.listener_projection(original))
                tool.install(args)
                self.assertEqual(context.minimum_version, ssl.TLSVersion.TLSv1_2)
                self.assertEqual(context.wrap_socket.call_args.kwargs['server_hostname'], 'localhost')
                diagnostic = (args.directory / 'install-diagnostics.json').read_bytes()
                tool.restore(args)
                self.assertEqual((args.directory / 'install-diagnostics.json').read_bytes(), diagnostic)
                self.assertEqual(json.loads(diagnostic)['result'], 'PASS')
                self.assertEqual(tool.listener_projection(broker.listener), tool.listener_projection(original))
                puts = [body for method, path, body in broker.calls if method == 'PUT'][1:]
                self.assertEqual(len(puts), 2)
                self.assertTrue(all(body['id'] == 'ssl:default' and body['type'] == 'ssl' for body in puts))

    def test_each_failure_keeps_its_stage_without_serializing_private_exception_messages(self):
        phases = {'listener-update': 'BROKER_HTTP_REFUSED', 'listener-readback': 'OPERATION_FAILED',
                  'identity-readback': 'PLATFORM_IDENTITY_CHANGED', 'tls-context': 'OPERATION_FAILED',
                  'tls-connect': 'NETWORK_TIMEOUT', 'tls-handshake-and-hostname-verification': 'TLS_HANDSHAKE_FAILED',
                  'metrics-key-create': 'BROKER_HTTP_REFUSED', 'metrics-key-readback': 'METRICS_IDENTITY_INVALID'}
        for phase, code in phases.items():
            with self.subTest(phase=phase), tempfile.TemporaryDirectory() as value:
                stack, args, broker, _ = self.fixture(Path(value), phase)
                with stack, self.assertRaises(Exception): tool.install(args)
                text = (args.directory / 'install-diagnostics.json').read_text()
                diagnostic = json.loads(text)
                self.assertEqual((diagnostic['result'], diagnostic['phase'], diagnostic['failure']['code']), ('FAIL', phase, code))
                self.assertNotIn('secret', text)
                self.assertNotIn('private-', text)
                self.assertNotIn('READY', text)
                self.assertEqual((args.directory / 'install-diagnostics.json').stat().st_mode & 0o777, 0o600)

    def test_unknown_key_create_outcome_is_revoked_and_original_install_failure_survives_restore(self):
        with tempfile.TemporaryDirectory() as value:
            stack, args, broker, _ = self.fixture(Path(value), 'metrics-key-create')
            with stack:
                with self.assertRaises(tool.FixtureError): tool.install(args)
                before = (args.directory / 'install-diagnostics.json').read_bytes()
                self.assertEqual(len(broker.keys), 1)
                broker.fail_phase = None
                tool.restore(args)
                self.assertFalse(broker.keys)
                self.assertEqual(before, (args.directory / 'install-diagnostics.json').read_bytes())
                self.assertEqual(json.loads((args.directory / 'state.json').read_text())['status'], 'RESTORED')

    def test_existing_directory_cannot_be_overwritten_or_touch_broker(self):
        with tempfile.TemporaryDirectory() as value, patch.object(tool, 'Broker') as broker:
            directory = Path(value)
            (directory / 'state.json').write_text('existing evidence')
            with self.assertRaises(FileExistsError): tool.install(SimpleNamespace(directory=directory))
            self.assertEqual((directory / 'state.json').read_text(), 'existing evidence')
            broker.assert_not_called()

    def test_real_generated_ca_supports_strict_tls_and_wrong_hostname_is_still_rejected(self):
        with tempfile.TemporaryDirectory() as value:
            directory = Path(value) / 'tls'
            tool.generate(directory)
            server = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            server.load_cert_chain(directory / 'server.pem', directory / 'server.key')
            listener = socket.socket(); listener.bind(('127.0.0.1', 0)); listener.listen(2); listener.settimeout(5)
            errors = []
            def serve():
                for _ in range(2):
                    try:
                        connection, _ = listener.accept()
                        with connection:
                            with server.wrap_socket(connection, server_side=True): pass
                    except ssl.SSLError: pass  # Expected alert when the second client rejects hostname.
                    except Exception as error: errors.append(type(error).__name__)
            worker = threading.Thread(target=serve); worker.start()
            try:
                client = ssl.create_default_context(cafile=str(directory / 'ca.pem'))
                client.minimum_version = ssl.TLSVersion.TLSv1_2
                with socket.create_connection(listener.getsockname(), timeout=5) as raw:
                    with client.wrap_socket(raw, server_hostname='localhost') as secure:
                        self.assertIn(secure.version(), ('TLSv1.2', 'TLSv1.3'))
                with socket.create_connection(listener.getsockname(), timeout=5) as raw:
                    with self.assertRaises(ssl.SSLCertVerificationError) as refused:
                        client.wrap_socket(raw, server_hostname='another.invalid')
                self.assertEqual(tool.safe_error(refused.exception)['code'], 'TLS_CERTIFICATE_REJECTED')
            finally:
                worker.join(6); listener.close()
            self.assertFalse(worker.is_alive()); self.assertFalse(errors)


if __name__ == '__main__':
    unittest.main()
