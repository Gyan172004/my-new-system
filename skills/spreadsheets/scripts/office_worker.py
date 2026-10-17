#!/usr/bin/env python3
"""Use installed LibreOffice UNO for recalculation or an optional sheet overview."""
import argparse
from pathlib import Path
import shutil
import subprocess
import time
import uuid

import uno
from com.sun.star.beans import PropertyValue


def property_value(name, value):
    item = PropertyValue()
    item.Name, item.Value = name, value
    return item


def export(source, destination, profile, pdf_overview=False):
    if destination.exists():
        raise RuntimeError('Recalculation output already exists.')
    pipe = 'codex_spreadsheet_' + uuid.uuid4().hex
    office = subprocess.Popen([
        shutil.which('libreoffice'), '-env:UserInstallation=' + profile.as_uri(),
        '--headless', '--nologo', '--nodefault', '--norestore',
        '--accept=pipe,name=' + pipe + ';urp;StarOffice.ServiceManager',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    document, desktop = None, None
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
        deadline = time.monotonic() + 20
        while True:
            try:
                context = resolver.resolve('uno:pipe,name=' + pipe + ';urp;StarOffice.ComponentContext')
                break
            except Exception:
                if office.poll() is not None or time.monotonic() >= deadline:
                    raise RuntimeError('LibreOffice local IPC connection failed.')
                time.sleep(0.1)
        desktop = context.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', context)
        document = desktop.loadComponentFromURL(source.as_uri(), '_blank', 0, (
            property_value('Hidden', True), property_value('ReadOnly', True),
            property_value('UpdateDocMode', 0),
            property_value('MacroExecutionMode', uno.getConstantByName('com.sun.star.document.MacroExecMode.NEVER_EXECUTE')),
        ))
        if document is None or not document.supportsService('com.sun.star.sheet.SpreadsheetDocument'):
            raise RuntimeError('LibreOffice did not load a spreadsheet.')
        document.enableAutomaticCalculation(True)
        document.calculateAll()
        if pdf_overview:
            if any(not document.Sheets.getByIndex(i).IsVisible for i in range(document.Sheets.Count)):
                raise RuntimeError('Full-sheet overview of hidden sheets requires an explicit visibility review.')
            settings = (
                property_value('FilterName', 'calc_pdf_Export'),
                property_value('FilterData', uno.Any('[]com.sun.star.beans.PropertyValue', (property_value('SinglePageSheets', True),))),
            )
        else:
            settings = (property_value('FilterName', 'Calc Office Open XML'),)
        document.storeToURL(destination.as_uri(), settings + (property_value('Overwrite', False),))
    finally:
        if document is not None:
            try:
                document.close(True)
            except Exception:
                document.dispose()
        if desktop is not None:
            desktop.terminate()
        if office.poll() is None:
            office.terminate()
        try:
            office.wait(timeout=5)
        except subprocess.TimeoutExpired:
            office.kill()
            office.wait()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    parser.add_argument('profile', type=Path)
    parser.add_argument('--pdf-overview', action='store_true', help='Export one PDF page per visible sheet without changing workbook print settings.')
    options = parser.parse_args()
    export(options.source.resolve(), options.destination.resolve(), options.profile.resolve(), options.pdf_overview)
