import { toHttpParams } from './http-params.util';

describe('toHttpParams', () => {
  it('skips empty values and repeats array keys', () => {
    const params = toHttpParams({
      page: 0,
      search: '',
      status: null,
      roleIds: [1, 2],
      statuses: [],
      twoFactorEnabled: false,
      sort: undefined,
    });

    expect(params.get('page')).toBe('0');
    expect(params.getAll('roleIds')).toEqual(['1', '2']);
    expect(params.get('twoFactorEnabled')).toBe('false');
    expect(params.has('search')).toBeFalse();
    expect(params.has('status')).toBeFalse();
    expect(params.has('statuses')).toBeFalse();
    expect(params.has('sort')).toBeFalse();
  });
});
