"""Unfamiliar source programs with optional multi-value returns."""
from torch import nn


class ForeignReturn(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Linear(8, 8)
        self.second = nn.Linear(8, 8)

    def forward(self, x, extra=False):
        earlier = self.first(x)
        later = self.second(earlier)
        if extra:
            return later, earlier
        return later


class UnknownReturn(ForeignReturn):
    def forward(self, x, extra=False):
        earlier = self.first(x)
        later = unfamiliar_call(earlier)
        if extra:
            return later, earlier
        return later


class NestedReturn(ForeignReturn):
    def forward(self, x, extra=False):
        earlier = self.first(x)
        later = self.second(earlier)
        if x.sum() > 0:
            if extra:
                return later, earlier
            return later
        return earlier
