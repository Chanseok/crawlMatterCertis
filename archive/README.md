# Archive Directory

This directory contains legacy files that have been consolidated or refactored to maintain clean software architecture.

## Structure

### legacy-services/
Contains deprecated service implementations that were replaced during architectural cleanup.

#### IPCService Consolidation (Dec 2024)
- **IPCService-legacy.ts** - Original legacy IPCService (778 lines) from `src/ui/services/`
- **IPCService-core.ts** - Simplified core version from `src/ui/services/core/`
- **BaseService-core.ts** - Core BaseService that was part of the duplicated structure

**Current canonical version**: `src/ui/services/infrastructure/IPCService.ts` (623 lines)

These files were consolidated to eliminate confusion from having 3 files with the same name in different locations. All active code now uses the infrastructure layer implementation following Clean Code architecture principles.

## Guidelines

### When to Archive Files
1. Duplicate implementations that cause architectural confusion
2. Legacy code that has been refactored but may contain useful references
3. Experimental implementations that didn't make it to production

### Naming Convention
- Use descriptive suffixes: `-legacy`, `-core`, `-experimental`, `-v1`, etc.
- Preserve original file structure information in the name
- Include date/context comments in the archived files when helpful

### Before Archiving
1. Verify no active imports reference the files
2. Run full build and test suite to ensure functionality
3. Document the consolidation decision and new canonical locations
4. Commit changes with clear breaking change notes

## Future Cleanup Candidates

Based on codebase analysis, additional duplicate files identified for potential consolidation:

- **BaseService** implementations (3 versions)
- **database.ts** files (8+ versions across different modules)
- Component duplicates in various UI directories
- Utility function duplicates across service layers

Each consolidation should follow the same systematic approach used for IPCService.
