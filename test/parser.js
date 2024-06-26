// 头部解析
const CToken = 1 << 0;
const CSpace = 1 << 1;

const OctetTypes = (() => {
	const types = new Uint8Array(0xff);
	let sets = " \t\r\n";
	for (let i = 0, c = 0; i < sets.length; i++) {
		c = sets.charCodeAt(i);
		if (c < 0x80) types[c] |= CSpace;
	}

	for (let i = 0x20; i < 0x7f; i++) types[i] |= CToken;

	sets = ' \t"(),/:;<=>?@[]\\{}';
	for (let i = 0, c = 0; i < sets.length; i++) {
		c = sets.charCodeAt(i);
		if (c < 0x80) types[c] &= ~CToken;
	}

	return types;
})();

/**
 * 解析值和参数
 * @param {string} input - 待解析字符串
 * @return {[string | null, Object.<string, string> | null]} [值, 参数]
 */
export function parseValueAndParams(input, key = null) {
	let [value, s] = nextToken(input);
	if (!value) return [null, null];

	/** @type {Object.<string, string> | null} */
	const params = Object.create(null);
	let pkey;
	let pval;
	for (;;) {
		[pkey, s] = nextToken(skipSpace(s));
		if (!pkey || !s.startsWith("=")) break;

		[pval, s] = nextTokenQuoted(s.slice(1));
		if (!pval) break;

		pkey = pkey.toLowerCase();
		params[pkey] = pval;
		if (key && key === pkey) break;

		s = skipSpace(s);
		if (!s.startsWith(",")) break;
		s = s.slice(1);
	}
	return [value, params];
}

/**
 * 跳过空白字符
 * @param {string} str - 源字符串
 * @return 跳过空白字符后的字符串
 */
function skipSpace(str) {
	let i = 0;
	for (; i < str.length; i++) {
		const c = str.charCodeAt(i);
		if (c < 0x80 && (OctetTypes[c] & CSpace) === 0) break;
	}
	return str.slice(i);
}

/**
 * 获取下一个 token
 * @param {string} str - 源字符串
 * @return {[string, string]} [token, 剩余的字符串]
 */
function nextToken(str) {
	let i = 0;
	for (; i < str.length; i++) {
		const c = str.charCodeAt(i);
		if (c < 0x80 && (OctetTypes[c] & CToken) === 0) break;
	}
	return [str.slice(0, i), str.slice(i)];
}

/**
 * 获取下一个 token; 可能带有引号
 * @param {string} str - 源字符串
 * @return {[string, string]} [token, 剩余的字符串]
 */
function nextTokenQuoted(str) {
	if (!str.startsWith('"')) return nextToken(str);

	let idx = 1;
	do idx = str.indexOf('"', idx);
	while (idx >= 1 && str[idx - 1] === "\\");

	if (idx >= 1) return [str.slice(1, idx), str.slice(idx + 1)];
	return ["", ""];
}

function replaceAuthService(input, realmBase) {
	let [value, params] = parseValueAndParams(input);
	value = value || "Bearer";
	let realm = params?.realm;
	realm = realm ? `${realmBase}/${encodeURIComponent(realm)}` : realmBase;

	let out = `${value} realm="${realm}"`;
	if (params) {
		for (const key in params) {
			if (key === "realm") continue;
			out += `,${key}="${params[key]}"`;
		}
	}
	return out;
}

function replaceAuthServiceRegex(input, realmBase) {
	const regexp = /(realm=)(?:"([^"]*)"|([^,\s]*))/i;
	return input.replace(regexp, (_, prefix, quoted, unquoted) => {
		const realm = encodeURIComponent(quoted || unquoted || "");
		return realm
			? `${prefix}"${realmBase}/${realm}"`
			: `${prefix}"${realmBase}"`;
	});
}

function runBenchmark() {
	const headers = [
		'Bearer realm="https://example.com/v2/auth/",service="example.io",scope="repo/xxxx:latest"',
		'Digest realm="",qop="auth",nonce="abc123",opaque="xyz789"',
		'Basic realm="Access to the staging site", charset="UTF-8"',
		'Digest username="Mufasa", realm="testrealm@host.com", uri="/dir/index.html", response="1949323742"',
	];

	// 打印解析结果
	for (const header of headers) {
		console.log(replaceAuthService(header, "https://example.com/v2/auth"));
		console.log(replaceAuthServiceRegex(header, "https://example.com/v2/auth"));
	}

	// 测试解析方法1
	const start1 = performance.now();
	for (let i = 0; i < 100000; i++) {
		for (const header of headers) {
			replaceAuthService(header, "");
		}
	}
	const end1 = performance.now();
	console.log(`原始方法耗时: ${end1 - start1} ms`);

	// 测试解析方法2
	const start2 = performance.now();
	for (let i = 0; i < 100000; i++) {
		for (const header of headers) {
			replaceAuthServiceRegex(header, "");
		}
	}
	const end2 = performance.now();
	console.log(`正则表达式方法耗时: ${end2 - start2} ms`);
}

runBenchmark();
