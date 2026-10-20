"""Unfamiliar source compositions with late, multiply used external inputs."""
import torch
from torch import nn


class LateInputs(nn.Module):
    def produce(self, seed, context):
        a = torch.sin(seed)
        b = torch.cos(a)
        c = torch.relu(b)
        d = torch.tanh(c)
        e = torch.sin(d)
        f = torch.cos(e)
        return torch.sigmoid(f + context) * (f * context)

    def receive(self, signal, context, previous):
        a = torch.cos(signal)
        b = torch.sin(a)
        c = torch.tanh(b)
        d = torch.relu(c)
        e = torch.sin(d)
        f = torch.cos(e)
        return torch.tanh(f * context + previous) * torch.cos(f - context)

    def forward(self, seed, signal, context):
        previous = self.produce(seed, context)
        return self.receive(signal, context, previous)


class GuardedInputs(nn.Module):
    def receive(self, signal, context):
        a = torch.cos(torch.sin(torch.tanh(torch.relu(signal))))
        if context is not None:
            return a * context + context
        return a

    def forward(self, seed, signal, context):
        return self.receive(signal, context) + seed


class BraidedInputs(nn.Module):
    def produce(self, seed, context):
        a = torch.sin(torch.cos(torch.relu(seed)))
        b = torch.cos(torch.tanh(torch.sin(seed)))
        c = torch.relu(torch.sin(torch.cos(seed)))
        f = torch.cat([a, b, c], dim=-1)
        return torch.sigmoid(f + context) * (f * context)

    def receive(self, signal, context, previous):
        a = torch.sin(torch.cos(torch.relu(signal)))
        b = torch.cos(torch.tanh(torch.sin(signal)))
        c = torch.relu(torch.sin(torch.cos(signal)))
        f = torch.cat([a, b, c], dim=-1)
        return torch.tanh(f * context + previous) * torch.cos(f - context)

    def forward(self, seed, signal, context):
        left = self.produce(seed, context)
        right = self.produce(signal, context)
        return self.receive(signal, context, left + right)


class UnknownInputs(nn.Module):
    def receive(self, signal, context):
        a = torch.cos(torch.sin(torch.tanh(torch.relu(signal))))
        return external_unresolved(a, context, context)

    def forward(self, seed, signal, context):
        return self.receive(signal, context) + seed


class StatefulInputs(nn.Module):
    def receive(self, signal, context):
        a = torch.cos(torch.sin(torch.tanh(torch.relu(signal))))
        context.add_(a)
        return a * context + context

    def forward(self, seed, signal, context):
        return self.receive(signal, context) + seed
