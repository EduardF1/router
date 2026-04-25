import { describe, expect, it, vi } from 'vitest'
import { findRouteMatch, processRouteTree } from '../src/new-process-route-tree'

type TestRoute = {
  id: string
  fullPath: string
  path?: string
  isRoot?: boolean
  options?: {
    params?: {
      match?: (params: Record<string, string>) => boolean
      matchPriority?: number
      parse?: (params: Record<string, string>) => unknown
    }
  }
  children?: Array<TestRoute>
}

const root = (children: Array<TestRoute>): TestRoute => ({
  id: '__root__',
  isRoot: true,
  fullPath: '/',
  path: '/',
  children,
})

const integerMatch = (key: string) => (params: Record<string, string>) => {
  const value = Number(params[key])
  return Number.isInteger(value)
}

describe('params.match', () => {
  describe('basic matching', () => {
    it('matches route when params.match returns true', () => {
      const { processedTree } = processRouteTree(
        root([
          {
            id: '/$id',
            fullPath: '/$id',
            path: '$id',
            options: {
              params: {
                match: integerMatch('id'),
              },
            },
          },
        ]),
      )

      const result = findRouteMatch('/123', processedTree)
      expect(result?.route.id).toBe('/$id')
      expect(result?.rawParams).toEqual({ id: '123' })
    })

    it('skips route when params.match returns false and finds no alternative', () => {
      const { processedTree } = processRouteTree(
        root([
          {
            id: '/$id',
            fullPath: '/$id',
            path: '$id',
            options: {
              params: {
                match: integerMatch('id'),
              },
            },
          },
        ]),
      )

      const result = findRouteMatch('/abc', processedTree)
      expect(result).toBeNull()
    })

    it('skips route when params.match returns false and finds an alternative', () => {
      const { processedTree } = processRouteTree(
        root([
          {
            id: '/$id',
            fullPath: '/$id',
            path: '$id',
            options: {
              params: {
                match: integerMatch('id'),
              },
            },
          },
          {
            id: '/$slug',
            fullPath: '/$slug',
            path: '$slug',
          },
        ]),
      )

      const result = findRouteMatch('/hello-world', processedTree)
      expect(result?.route.id).toBe('/$slug')
      expect(result?.rawParams).toEqual({ slug: 'hello-world' })
    })

    it('skips route when params.match throws', () => {
      const { processedTree } = processRouteTree(
        root([
          {
            id: '/$id',
            fullPath: '/$id',
            path: '$id',
            options: {
              params: {
                match: () => {
                  throw 'invalid id'
                },
              },
            },
          },
          {
            id: '/$slug',
            fullPath: '/$slug',
            path: '$slug',
          },
        ]),
      )

      const result = findRouteMatch('/hello-world', processedTree)
      expect(result?.route.id).toBe('/$slug')
    })

    it('does not call params.parse during matching', () => {
      const parse = vi.fn(() => {
        throw new Error('parse should not run during matching')
      })
      const { processedTree } = processRouteTree(
        root([
          {
            id: '/$id',
            fullPath: '/$id',
            path: '$id',
            options: {
              params: {
                match: integerMatch('id'),
                parse,
              },
            },
          },
        ]),
      )

      const result = findRouteMatch('/123', processedTree)
      expect(result?.route.id).toBe('/$id')
      expect(result?.rawParams).toEqual({ id: '123' })
      expect(parse).not.toHaveBeenCalled()
    })
  })

  describe('priority', () => {
    it('params.match routes take precedence over unguarded dynamic routes', () => {
      const { processedTree } = processRouteTree(
        root([
          {
            id: '/$slug',
            fullPath: '/$slug',
            path: '$slug',
          },
          {
            id: '/$id',
            fullPath: '/$id',
            path: '$id',
            options: {
              params: {
                match: integerMatch('id'),
              },
            },
          },
        ]),
      )

      expect(findRouteMatch('/123', processedTree)?.route.id).toBe('/$id')
      expect(findRouteMatch('/hello-world', processedTree)?.route.id).toBe(
        '/$slug',
      )
    })

    it('static routes still take precedence over params.match dynamic routes', () => {
      const { processedTree } = processRouteTree(
        root([
          {
            id: '/settings',
            fullPath: '/settings',
            path: 'settings',
          },
          {
            id: '/$id',
            fullPath: '/$id',
            path: '$id',
            options: {
              params: {
                match: () => true,
              },
            },
          },
        ]),
      )

      expect(findRouteMatch('/settings', processedTree)?.route.id).toBe(
        '/settings',
      )
    })

    it('deep params.match routes can fall back to a sibling route', () => {
      const { processedTree } = processRouteTree(
        root([
          {
            id: '/$a/$b/$c',
            fullPath: '/$a/$b/$c',
            path: '$a/$b/$c',
            options: {
              params: {
                match: ({ c }) => c === 'three',
              },
            },
          },
          {
            id: '/$x/$y/$z',
            fullPath: '/$x/$y/$z',
            path: '$x/$y/$z',
          },
        ]),
      )

      expect(findRouteMatch('/one/two/three', processedTree)?.route.id).toBe(
        '/$a/$b/$c',
      )
      expect(findRouteMatch('/one/two/wrong', processedTree)?.route.id).toBe(
        '/$x/$y/$z',
      )
    })

    it('params.matchPriority can influence matching order', () => {
      const highA = root([
        {
          id: '/$a',
          fullPath: '/$a',
          path: '$a',
          options: {
            params: {
              match: () => true,
              matchPriority: 1,
            },
          },
        },
        {
          id: '/$z',
          fullPath: '/$z',
          path: '$z',
          options: {
            params: {
              match: () => true,
              matchPriority: -1,
            },
          },
        },
      ])
      expect(
        findRouteMatch('/123', processRouteTree(highA).processedTree)?.route.id,
      ).toBe('/$a')

      const highZ = root([
        {
          id: '/$a',
          fullPath: '/$a',
          path: '$a',
          options: {
            params: {
              match: () => true,
              matchPriority: -1,
            },
          },
        },
        {
          id: '/$z',
          fullPath: '/$z',
          path: '$z',
          options: {
            params: {
              match: () => true,
              matchPriority: 1,
            },
          },
        },
      ])
      expect(
        findRouteMatch('/123', processRouteTree(highZ).processedTree)?.route.id,
      ).toBe('/$z')
    })
  })

  describe('regex-like match patterns', () => {
    it('matches UUID values before falling back to a slug route', () => {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const { processedTree } = processRouteTree(
        root([
          {
            id: '/$uuid',
            fullPath: '/$uuid',
            path: '$uuid',
            options: {
              params: {
                match: ({ uuid }) => uuidRegex.test(uuid!),
              },
            },
          },
          {
            id: '/$slug',
            fullPath: '/$slug',
            path: '$slug',
          },
        ]),
      )

      expect(
        findRouteMatch('/550e8400-e29b-41d4-a716-446655440000', processedTree)
          ?.route.id,
      ).toBe('/$uuid')
      expect(findRouteMatch('/my-blog-post', processedTree)?.route.id).toBe(
        '/$slug',
      )
    })

    it('matches dates before falling back to a slug route', () => {
      const isDate = (date: string | undefined) => {
        if (!date) return false
        return !Number.isNaN(new Date(date).getTime())
      }
      const { processedTree } = processRouteTree(
        root([
          {
            id: '/posts/$date',
            fullPath: '/posts/$date',
            path: 'posts/$date',
            options: {
              params: {
                match: ({ date }) => isDate(date),
              },
            },
          },
          {
            id: '/posts/$slug',
            fullPath: '/posts/$slug',
            path: 'posts/$slug',
          },
        ]),
      )

      const dateResult = findRouteMatch('/posts/2024-01-15', processedTree)
      expect(dateResult?.route.id).toBe('/posts/$date')
      expect(dateResult?.rawParams.date).toBe('2024-01-15')
      expect(
        findRouteMatch('/posts/my-first-post', processedTree)?.route.id,
      ).toBe('/posts/$slug')
    })
  })

  describe('nested routes', () => {
    it('parent params.match failure prevents child matching', () => {
      const { processedTree } = processRouteTree(
        root([
          {
            id: '/$orgId',
            fullPath: '/$orgId',
            path: '$orgId',
            options: {
              params: {
                match: integerMatch('orgId'),
              },
            },
            children: [
              {
                id: '/$orgId/settings',
                fullPath: '/$orgId/settings',
                path: 'settings',
              },
            ],
          },
          {
            id: '/$slug/about',
            fullPath: '/$slug/about',
            path: '$slug/about',
          },
        ]),
      )

      expect(findRouteMatch('/123/settings', processedTree)?.route.id).toBe(
        '/$orgId/settings',
      )
      expect(findRouteMatch('/my-org/about', processedTree)?.route.id).toBe(
        '/$slug/about',
      )
      expect(findRouteMatch('/my-org/settings', processedTree)).toBeNull()
    })

    it('child params.match failure falls back to sibling route', () => {
      const { processedTree } = processRouteTree(
        root([
          {
            id: '/users',
            fullPath: '/users',
            path: 'users',
            children: [
              {
                id: '/users/$userId',
                fullPath: '/users/$userId',
                path: '$userId',
                options: {
                  params: {
                    match: integerMatch('userId'),
                  },
                },
              },
              {
                id: '/users/$username',
                fullPath: '/users/$username',
                path: '$username',
              },
            ],
          },
        ]),
      )

      const numericResult = findRouteMatch('/users/42', processedTree)
      expect(numericResult?.route.id).toBe('/users/$userId')
      expect(numericResult?.rawParams).toEqual({ userId: '42' })

      const usernameResult = findRouteMatch('/users/johndoe', processedTree)
      expect(usernameResult?.route.id).toBe('/users/$username')
      expect(usernameResult?.rawParams).toEqual({ username: 'johndoe' })
    })
  })

  describe('pathless routes', () => {
    it('pathless layout with params.match gates children', () => {
      const { processedTree } = processRouteTree(
        root([
          {
            id: '/',
            fullPath: '/',
            path: '/',
          },
          {
            id: '/$foo/_layout',
            fullPath: '/$foo',
            path: '$foo',
            options: {
              params: {
                match: integerMatch('foo'),
              },
            },
            children: [
              {
                id: '/$foo/_layout/bar',
                fullPath: '/$foo/bar',
                path: 'bar',
              },
              {
                id: '/$foo/_layout/',
                fullPath: '/$foo/',
                path: '/',
              },
            ],
          },
          {
            id: '/$foo/hello',
            fullPath: '/$foo/hello',
            path: '$foo/hello',
          },
        ]),
      )

      expect(findRouteMatch('/123/bar', processedTree)?.route.id).toBe(
        '/$foo/_layout/bar',
      )
      const indexResult = findRouteMatch('/123', processedTree)
      expect(indexResult?.route.id).toBe('/$foo/_layout/')
      expect(indexResult?.rawParams).toEqual({ foo: '123' })

      expect(findRouteMatch('/abc/hello', processedTree)?.route.id).toBe(
        '/$foo/hello',
      )
      expect(findRouteMatch('/abc/bar', processedTree)).toBeNull()
    })
  })

  describe('optional params', () => {
    it('optional param with static fallback', () => {
      const validLangs = ['en', 'es', 'fr', 'de']
      const { processedTree } = processRouteTree(
        root([
          {
            id: '/{-$lang}/home',
            fullPath: '/{-$lang}/home',
            path: '{-$lang}/home',
            options: {
              params: {
                match: ({ lang }) => !lang || validLangs.includes(lang),
              },
            },
          },
          {
            id: '/home',
            fullPath: '/home',
            path: 'home',
          },
        ]),
      )

      expect(findRouteMatch('/en/home', processedTree)?.route.id).toBe(
        '/{-$lang}/home',
      )
      expect(findRouteMatch('/home', processedTree)?.route.id).toBe(
        '/{-$lang}/home',
      )
      expect(findRouteMatch('/it/home', processedTree)).toBeNull()
    })

    it('optional param at root can match or skip the optional segment', () => {
      const validLangs = ['en', 'es', 'fr', 'de']
      const { processedTree } = processRouteTree(
        root([
          {
            id: '/{-$lang}',
            fullPath: '/{-$lang}',
            path: '{-$lang}',
            options: {
              params: {
                match: ({ lang }) => !lang || validLangs.includes(lang),
              },
            },
          },
        ]),
      )

      expect(findRouteMatch('/en', processedTree)?.route.id).toBe('/{-$lang}')
      expect(findRouteMatch('/', processedTree)?.route.id).toBe('/{-$lang}')
      expect(findRouteMatch('/about', processedTree)).toBeNull()
    })
  })

  describe('wildcard routes', () => {
    it('wildcard with params.match falls back in fuzzy mode', () => {
      const { processedTree } = processRouteTree(
        root([
          {
            id: '/files/$',
            fullPath: '/files/$',
            path: 'files/$',
            options: {
              params: {
                match: ({ _splat }) => !_splat!.includes('..'),
              },
            },
          },
          {
            id: '/files',
            fullPath: '/files',
            path: 'files',
          },
        ]),
      )

      expect(
        findRouteMatch('/files/docs/readme.txt', processedTree)?.route.id,
      ).toBe('/files/$')

      const result = findRouteMatch(
        '/files/../../secret/photo.jpg',
        processedTree,
        true,
      )
      expect(result?.route.id).toBe('/files')
      expect(result?.rawParams['**']).toBe('../../secret/photo.jpg')
    })

    it('index params.match failure does not block wildcard sibling', () => {
      const { processedTree } = processRouteTree(
        root([
          {
            id: '/a/',
            fullPath: '/a/',
            path: 'a/',
            options: {
              params: {
                match: () => false,
              },
            },
          },
          {
            id: '/a/$',
            fullPath: '/a/$',
            path: 'a/$',
          },
        ]),
      )

      const result = findRouteMatch('/a', processedTree)
      expect(result?.route.id).toBe('/a/$')
      expect(result?.rawParams).toEqual({ '*': '', _splat: '' })
    })
  })
})
