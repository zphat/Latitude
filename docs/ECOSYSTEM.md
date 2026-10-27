# Using Latitude with Sundial and Longitude

These are independent open-source projects with related visual identities. You
can use any one without installing the others. This guide describes a workflow,
not a shared account, automatic integration or a promise of compatible mods.

| Step | Application | Practical handoff today |
| --- | --- | --- |
| Plan an episode | [Sundial](https://github.com/zphat/Sundial) | Keep an outline and recording/editing tasks in your planner; open the recording app yourself |
| Record and edit | [Latitude](../README.md) | Record a take, retain separate audio, then export a finished file through the optional Editor |
| Make the thumbnail or cover | [Longitude](https://github.com/zphat/Longitude) | Use your images or a captured still; export artwork alongside the finished episode |

Sundial's repository describes optional hosted sync and self-hosting. Latitude
records locally; Longitude edits images locally. No Latitude-to-Sundial sync or
automatic transfer of recordings is implemented. Files are the current handoff.
There is no need to merge the apps or their runtimes to make a matching workflow.

## Designing a coordinated kit

A kit could contain Latitude scenes/static graphics, Longitude editable artwork,
and a plain episode checklist to copy into Sundial. Give each item its own import
instructions, compatible version, license and editable source where appropriate.
Do not advertise a Sundial template importer or a shared project format that has
not been implemented and tested.

Longitude's documentation says it accepts Latitude theme packs. This is a narrow
color-theme compatibility path, not shared scene layouts, editor projects,
fonts or executable mod APIs. Test a pack in both apps before claiming support.

Fonts require special care: Longitude's original Meridian and Gridline families
are already distributed under OFL-1.1, as documented in its
[font guide](https://github.com/zphat/Longitude/blob/main/docs/FONTS.md).
Do not present a repackaged open font as a newly exclusive typeface. Preserve
its license if distributing the font file. The [OFL FAQ](https://openfontlicense.org/ofl-faq/)
explains the distinction between selling font software by itself, permitted
software bundles, and artwork made using a font. A paid kit's value should be
its original design work, useful layouts and tested workflow; each included
component keeps its own license.

Commercial kits, donation links and hosting arrangements are separate maintainer
choices. This guide introduces no storefront, new license restriction, price,
paid feature gate or subscription. Before offering a kit, verify rights and
compatibility and write down exactly what the purchase includes.
