"""Sanity check once the installed package is available."""


def test_moltwatch_package_importable():
    import moltwatch

    assert moltwatch.__version__
